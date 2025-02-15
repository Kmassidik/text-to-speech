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
const { TextToSpeechService2 } = require('./services/tts-service-2');

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
    // connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    connect.stream({ url: `wss://${process.env.SERVER}/connection-v2` });
    // connect.stream({ url: `wss://${process.env.SERVER}/connection-v3` });
    // connect.stream({ url: `wss://${process.env.SERVER}/connection-v4` });
    res.type('text/xml');
    res.end(response.toString());
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
    const ttsService = new MinimaxiTTSService({});

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
        ttsService.generate({ partialResponseIndex: null, partialResponse: 'Halo! • Ada yang bisa saya • bantu hari ini?' }, 0);
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



app.ws('/connection-v3', (ws) => {
  try {
    ws.on('error', console.error);

    // Variables to track the call and its audio
    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService2({});
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

app.ws('/connection-v4', (ws) => {
  try {
    ws.on('error', console.error);

    // Variabel untuk melacak panggilan dan audionya
    let streamSid;
    let callSid;
    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    // Menambahkan parameter bahasa ke service TTS agar menggunakan Bahasa Indonesia
    const ttsService = new MinimaxiTTSService({ language: "id-ID" });

    let marks = [];              // Melacak marker penyelesaian audio
    let interactionCount = 0;    // Menghitung jumlah interaksi

    // Handle pesan masuk dari Twilio
    ws.on('message', function message(data) {
      // Cetak seluruh data yang diterima dari Twilio
      // console.log("Pesan masuk dari Twilio:", data);

      let msg;
      try {
        msg = JSON.parse(data);
      } catch (err) {
        console.error("Gagal melakukan parse JSON:", err);
        return;
      }

      // Cetak pesan yang sudah di-parse untuk keperluan debugging

      if (msg.event === 'start') {
        // Panggilan dimulai - atur ID dan kirim pesan selamat datang
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);
        console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
        // Ubah pesan selamat datang ke Bahasa Indonesia
        ttsService.generate({
          partialResponseIndex: null,
          partialResponse: 'Halo! • Ada yang bisa saya • bantu hari ini?'
        }, 0);
      } else if (msg.event === 'media') {
        // Menerima audio dari pemanggil - kirim ke transkripsi
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        // Audio selesai diputar
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        // Panggilan berakhir
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });

    // Menangani interupsi (pemanggil berbicara saat asisten sedang bicara)
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

    // Proses teks transkripsi melalui GPT
    // Proses teks transkripsi melalui GPT dan deteksi kata kunci
    transcriptionService.on('transcription', async (text) => {
      if (!text) {
        return;
      }

      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);

      // Deteksi kata kunci dalam teks yang diterima
      // Misalnya, kita ingin mendeteksi kata "bantuan", "layanan", atau "keamanan"
      const keywords = ['bantuan', 'layanan', 'keamanan'];
      const lowerText = text.toLowerCase();
      const detectedKeywords = keywords.filter(keyword => lowerText.includes(keyword));

      if (detectedKeywords.length > 0) {
        console.log(`Kata kunci terdeteksi: ${detectedKeywords.join(', ')}`);
        // Anda bisa menambahkan aksi lain, misalnya:
        // - Mengirim respon khusus
        // - Memanggil service tertentu
        // - Mengubah alur percakapan
      }

      // Lanjutkan pemrosesan teks ke GPT
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    // transcriptionService.on('transcription', async (text) => {
    //   if (!text) { return; }
    //   console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
    //   gptService.completion(text, interactionCount);
    //   interactionCount += 1;
    // });

    // Kirim respons GPT ke TTS
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
      ttsService.generate(gptReply, icount);
    });

    // Kirim audio hasil TTS ke pemanggil
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio);
    });

    // Melacak saat audio sudah dikirim
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


