require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class TextToSpeechService2 extends EventEmitter {
  constructor() {
    super();
    this.nextExpectedIndex = 0; // Track order of speech chunks
    this.speechBuffer = {}; // Store speech pieces
  }

  // Convert text to speech using ElevenLabs API
  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    // If there's no text to synthesize, do nothing.
    if (!partialResponse) return;

    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_MODEL_ID}?output_format=ulaw_8000`;
      
      const payload = {
        text: partialResponse,
        model_id: "eleven_multilingual_v2"
      };

      // Call ElevenLabs TTS API
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });



      if (response.ok) {
        // Convert the audio response to a Buffer
        const audioArrayBuffer = await response.arrayBuffer();
        const base64String = Buffer.from(audioArrayBuffer).toString('base64');
        // Emit the speech event with the synthesized audio
        this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
      } else {
        const errorText = await response.text();
        console.error('ElevenLabs TTS error:', response.status, errorText);
      }
    } catch (err) {
      console.error('Error occurred in TextToSpeech service:', err);
    }
  }
}

module.exports = { TextToSpeechService2 };
