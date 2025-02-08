// services/transcriptionv2-service.js
const MiniMax = require('minimax');
const EventEmitter = require('events');

class TranscriptionV2Service extends EventEmitter {
  constructor() {
    super();
    this.client = new MiniMax({ apiKey: process.env.MINIMAX_API_KEY });
  }

  async send(audioBuffer) {
    try {
      // Changed: using `speech` instead of `stt` (verify this against your MiniMax API)
      const response = await this.client.speech.recognize({
        audio: audioBuffer,
        format: "wav" // Ensure Twilio sends audio in a compatible format
      });

      const text = response.transcription;
      console.log(`MiniMax STT -> Transcribed Text: ${text}`.yellow);

      this.emit('transcription', text); // Emit transcription event
    } catch (error) {
      console.error("MiniMax STT Error:", error);
    }
  }
}

module.exports = { TranscriptionV2Service };
