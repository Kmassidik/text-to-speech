// Import required libraries for environment vars, buffer handling and events
require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class TextToSpeechService extends EventEmitter {
 constructor() {
   super();
   this.nextExpectedIndex = 0;      // Track order of speech chunks
   this.speechBuffer = {};          // Store speech pieces
 }

 // Convert text to speech using Deepgram's API
 async generate(gptReply, interactionCount) {
   const { partialResponseIndex, partialResponse } = gptReply;

   // Skip if no text to convert
   if (!partialResponse) { return; }

   try {
     // Call Deepgram's text-to-speech API
     const response = await fetch(
       `https://api.deepgram.com/v1/speak?model=${process.env.VOICE_MODEL}&encoding=mulaw&sample_rate=8000&container=none`,
       {
         method: 'POST',
         headers: {
           'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           text: partialResponse,
         }),
       }
     );

     // Handle successful response
     if (response.status === 200) {
       try {
         // Convert audio response to base64 format
         const blob = await response.blob();
         console.log(blob, "<<<<<<<<<< blob")
         const audioArrayBuffer = await blob.arrayBuffer();
         const base64String = Buffer.from(audioArrayBuffer).toString('base64');

         // Send audio to be played
         this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
       } catch (err) {
         console.log(err);
       }
     } else {
       console.log('Deepgram TTS error:');
       console.log(response);
     }
   } catch (err) {
     console.error('Error occurred in TextToSpeech service');
     console.error(err);
   }
 }
}

module.exports = { TextToSpeechService };


// Import required libraries for environment vars, buffer handling and events
// textToSpeechService.js

// require('dotenv').config();
// const EventEmitter = require('events');
// const fetch = require('node-fetch');
// const { Buffer } = require('node:buffer');

// class TextToSpeechService extends EventEmitter {
//   constructor() {
//     super();
//   }

//   async generate(gptReply, interactionCount) {
//     const { partialResponseIndex, partialResponse } = gptReply;
//     if (!partialResponse) return;

//     try {
//       const groupId = process.env.GROUP_ID;
//       const minimaxiUrl = `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${groupId}`;

//       // Build the TTS payload for Minimaxi
//       const ttsPayload = {
//         model: 'speech-01-hd',
//         text: partialResponse,
//         stream: false,
//         subtitle_enable: false,
//         voice_setting: {
//           voice_id: 'moss_audio_a7c066a3-dd74-11ef-befa-5ed23b965939',
//           speed: 1,
//           vol: 1,
//           pitch: 0
//         },
//         audio_setting: {
//           sample_rate: 8000,
//           format: 'wav',
//           channel: 1
//           // Possibly omit 'bitrate' if not relevant for WAV
//         }
//       };

//       // Call Minimaxi TTS API
//       const response = await fetch(minimaxiUrl, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY}`,
//         },
//         body: JSON.stringify(ttsPayload),
//       });

//       if (!response.ok) {
//         console.error('Minimaxi TTS error:', response.status, response.statusText);
//         return;
//       }

//       const responseData = await response.json();
//       // Minimaxi returns a hex-encoded mp3 in `responseData.data.audio`
//       const audioHex = responseData?.data?.audio;
//       if (!audioHex) {
//         console.error('No audio data from Minimaxi TTS');
//         return;
//       }

//       // Convert the hex string to a Base64 string
//       const audioBuffer = Buffer.from(audioHex, 'hex');
//       const base64String = audioBuffer.toString('base64');

//       // Emit an event so the /connection code can send this audio to Twilio
//       this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
//     } catch (err) {
//       console.error('Error in Minimaxi TTS generation:', err);
//     }
//   }
// }

// module.exports = { TextToSpeechService };
