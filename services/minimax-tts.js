require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class MinimaxiTTSService extends EventEmitter {
  constructor() {
    super();
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    try {
      const groupId = process.env.GROUP_ID;
      const minimaxiUrl = `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${groupId}`;

      const ttsPayload = {
        model: 'speech-01-hd',
        text: partialResponse,
        stream: false,
        subtitle_enable: false,
        voice_setting: {
          voice_id: 'moss_audio_a7c066a3-dd74-11ef-befa-5ed23b965939',
          speed: 1,
          vol: 1,
          pitch: 0
        },
        audio_setting: {
          sample_rate: 8000,
          // Request MP3 output from Minimaxi
          format: 'mp3',
        },
      };

      const response = await fetch(minimaxiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY}`,
        },
        body: JSON.stringify(ttsPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Minimaxi TTS error:', response.status, errorText);
        return;
      }

      const responseData = await response.json();
      console.log('Minimaxi Response:', responseData);

      if (!responseData?.data?.audio) {
        console.error('No audio data found in response');
        return;
      }

      // The audio from Minimaxi is assumed to be base64-encoded MP3.
      const minimaxiAudioB64 = responseData.data.audio;

      // Call the Python conversion API to convert the audio.
      const conversionResponse = await fetch('http://localhost:5000/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ audio: minimaxiAudioB64 })
      });

      if (!conversionResponse.ok) {
        const errorData = await conversionResponse.json();
        console.error('Conversion API error:', errorData);
        return;
      }

      const conversionData = await conversionResponse.json();
      const convertedAudioB64 = conversionData.converted_audio;
      console.log(`Converted audio received, length: ${convertedAudioB64.length} characters`);

      // Emit the speech event with the converted audio.
      this.emit('speech', partialResponseIndex, convertedAudioB64, partialResponse, interactionCount);
      
    } catch (err) {
      console.error('Error in MinimaxiTTSService:', err);
    }
  }
}

module.exports = { MinimaxiTTSService };
