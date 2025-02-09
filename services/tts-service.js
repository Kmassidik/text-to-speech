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
      // 98trMxassnD1U7BV4PsK
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
            speak: {
              "provider": "eleven_labs",
              "voice_id": "bIHbv24MWmeRgasZH58o"
            }

          }),
        }
      );

      // Handle successful response
      if (response.status === 200) {
        try {
          console.log(response);

          // Convert audio response to base64 format
          const blob = await response.blob();
          console.log(blob);

          const audioArrayBuffer = await blob.arrayBuffer();

          console.log(audioArrayBuffer);

          const base64String = Buffer.from(audioArrayBuffer).toString('base64');
          console.log(base64String);

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