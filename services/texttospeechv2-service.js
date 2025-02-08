// services/texttospeechv2-service.js
const MiniMax = require('minimax');
const { Buffer } = require('node:buffer');

class TextToSpeechV2Service {
  constructor() {
    this.client = new MiniMax({ apiKey: process.env.MINIMAX_API_KEY });
  }

  async generate(text, interactionCount) {
    try {
      console.log(`MiniMax TTS -> Generating speech: ${text}`.green);
      const response = await this.client.tts.synthesize({
        text,
        voice: "moss_audio_a7c066a3-dd74-11ef-befa-5ed23b965939", // Adjust voice if needed
        format: "mp3"
      });

      // Convert the audio content to a base64-encoded string.
      const base64Audio = Buffer.from(response.audioContent).toString('base64');
      return { audio: base64Audio, label: `speech-${interactionCount}` };
    } catch (error) {
      console.error("MiniMax TTS Error:", error);
      return null;
    }
  }
}

module.exports = { TextToSpeechV2Service };
