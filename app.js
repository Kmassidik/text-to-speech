// Import required packages and services
require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');
const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Set up Express with WebSocket support
const app = express();
ExpressWs(app);
const PORT = process.env.PORT || 4000;

// Handle incoming calls from Twilio
app.post('/incoming', (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    // Tell Twilio where to connect the call's media stream
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

// Handle WebSocket connection for the call's audio
app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);

    // Variables to track the call and its audio
    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
    let marks = [];              // Track audio completion markers
    let interactionCount = 0;    // Count back-and-forth exchanges

    // Handle incoming messages from Twilio
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        // Call started - set up IDs and send welcome message
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);
        console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
        ttsService.generate({ partialResponseIndex: null, partialResponse: 'Welcome to Cybersphere Automotive. • How can I help you today?' }, 0);
      }
      else if (msg.event === 'media') {
        // Received audio from caller - send to transcription
        transcriptionService.send(msg.media.payload);
      }
      else if (msg.event === 'mark') {
        // Audio piece finished playing
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      }
      else if (msg.event === 'stop') {
        // Call ended
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    // Handle interruptions (caller speaking while assistant is)
    transcriptionService.on('utterance', async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });

    // Process transcribed text through GPT
    transcriptionService.on('transcription', async (text) => {
      if (!text) { return; }
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    // Send GPT's response to text-to-speech
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      ttsService.generate(gptReply, icount);
    });

    // Send converted speech to caller
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio);
    });

    // Track when audio pieces are sent
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.get('/', (req, res) => {
  res.status(200).send("welcome")
})

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});