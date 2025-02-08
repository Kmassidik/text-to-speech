// Import required packages and services
require('dotenv').config();
require('colors');

const fs = require('fs'); // <-- import fs
const path = require('path'); // <-- import path if you need path.join

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { MinimaxiTTSService } = require('./services/minimax-tts');

// Set up Express with WebSocket support
const app = express();
app.use(express.static('public'));
ExpressWs(app);
const PORT = process.env.PORT || 4000;

// Handle incoming calls from Twilio
app.post('/incoming', (req, res) => {
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    // Tell Twilio where to connect the call's media stream
    connect.stream({ url: `wss://${process.env.SERVER}/connection-v2` });
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

app.ws('/connection-v2', (ws) => {
  try {
    ws.on('error', console.error);

    // Variables to track the call and its audio
    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();

    // Use our Minimaxi-based TTS
    const ttsService2 = new MinimaxiTTSService();

    let marks = [];              // Track audio completion markers
    let interactionCount = 0;    // Count back-and-forth exchanges

    // -- same logic as your old route:

    ws.on('message', function message(data) {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        console.log(`(v2) Twilio -> Starting Media Stream for ${streamSid}`.underline.red);

        // Provide a welcome message
        ttsService2.generate(
          { partialResponseIndex: null, partialResponse: 'Welcome to Cybersphere Automotive. • Apa Yang Dapat Saya Bantu Hari Ini?' },
          0
        );
      }
      else if (msg.event === 'media') {
        // Incoming caller audio => transcription
        transcriptionService.send(msg.media.payload);
      }
      else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`(v2) Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      }
      else if (msg.event === 'stop') {
        console.log(`(v2) Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    // Handle interruptions
    transcriptionService.on('utterance', async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log('(v2) Twilio -> Interruption, Clearing stream'.red);
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
      console.log(`(v2) Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    // GPT => Minimaxi TTS
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`(v2) Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      ttsService2.generate(gptReply, icount);
    });

    // When Minimaxi TTS is done, we have audio => stream to Twilio
    ttsService2.on('speech', (responseIndex, audioBase64, label, icount) => {
      console.log(`(v2) Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audioBase64);
    });

    // Keep track of playing audio
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });

  } catch (err) {
    console.log('(v2) Error in /connection-v2:', err);
  }
});


app.get('/', (req, res) => {
  res.status(200).send("welcome")
})

app.post('/voice', async (req, res) => {
  try {
    // 1) Minimaxi TTS -> Buffer
    const buffer = await getMinimaxiTTS('Halo aku anang hermansyah dari indonesia.');
    // 2) Write buffer to "public" folder
    const fileName = `tts_${Date.now()}.mp3`;
    const filePath = path.join(__dirname, 'public', fileName);
    fs.writeFileSync(filePath, buffer);

    console.log('Saved TTS file at:', filePath);

    // 3) TwiML <Play>
    const twiml = new VoiceResponse();
    twiml.play(`https://${process.env.SERVER}/${fileName}`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating TTS');
  }
});

// Helper function
async function getMinimaxiTTS(text) {
  const url = `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${process.env.GROUP_ID}`;
  const payload = {
    model: 'speech-01-hd',
    text,
    stream: false,
    subtitle_enable: false,
    voice_setting: {
      voice_id: 'moss_audio_a7c066a3-dd74-11ef-befa-5ed23b965939',
      speed: 1,
      vol: 1,
      pitch: 0
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY}`
      },
      body: JSON.stringify(payload),
    });

    // Log the HTTP status code
    // console.log(`Minimaxi TTS response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      // Attempt to parse body for extra error details
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseErr) {
        errorData = { error: 'Failed to parse response body' };
      }
      console.error('Minimaxi responded with an error:', JSON.stringify(errorData, null, 2));
      throw new Error(`Minimaxi TTS error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Log the entire response payload for debugging
    console.log('Minimaxi TTS raw data:', JSON.stringify(data, null, 2));

    if (!data.data || !data.data.audio) {
      console.error('No audio found in Minimaxi response:', JSON.stringify(data, null, 2));
      throw new Error('No audio found in Minimaxi response');
    }

    // Return the audio as a Buffer (mp3 in hex format)
    return Buffer.from(data.data.audio, 'hex');

  } catch (err) {
    // Catch any network or runtime errors
    console.error('Error in getMinimaxiTTS:', err);
    throw err; // Re-throw so caller knows it failed
  }
}

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});


