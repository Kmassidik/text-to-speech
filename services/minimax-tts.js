require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class MinimaxiTTSService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Main entry: generate TTS from GPT reply,
   * produce mu-law chunks, emit "speech" events for Twilio <Start><Stream>
   */
  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    try {
      // -- 1) Dynamically import x-law, since it's an ES module
      const xlawModule = await import('x-law');
      const { mulaw } = xlawModule; // extract the 'mulaw' property

      // -- 2) Fetch raw PCM from Minimaxi (8kHz, 16-bit)
      const pcmBuffer = await this._fetchMinimaxiPCM(partialResponse);
      if (!pcmBuffer || pcmBuffer.length === 0) {
        console.error('No PCM data from Minimaxi or buffer is empty.');
        return;
      }

      // -- 3) Convert PCM -> mu-law using x-law's encodeBuffer
      //    Minimaxi's PCM is 16-bit LE, so we pass { depth:16, signed:true, littleEndian:true }
      const encodedMulaw = mulaw.encodeBuffer(pcmBuffer, {
        depth: 16,
        signed: true,
        littleEndian: true
      });

      // -- 4) Chunk mu-law data into 20 ms frames => 160 bytes each (@8kHz => 160 samples)
      const chunkSize = 160;
      const muLawChunks = [];

      for (let i = 0; i < encodedMulaw.length; i += chunkSize) {
        if (i + chunkSize > encodedMulaw.length) {
          // leftover partial chunk, skip or handle
          console.log(`Discarding leftover ${encodedMulaw.length - i} bytes (partial chunk)`);
          break;
        }
        const chunk = encodedMulaw.slice(i, i + chunkSize);
        muLawChunks.push(chunk);
      }

      // -- 5) Emit "speech" events for each chunk
      let chunkIndex = 0;
      for (const chunk of muLawChunks) {
        const base64String = chunk.toString('base64');

        // Combine partialResponseIndex + chunkIndex if you want a unique index
        const responseIndex = partialResponseIndex !== null
          ? `${partialResponseIndex}-${chunkIndex}`
          : chunkIndex;

        // Twilio <Start><Stream> => your StreamService sends these as 'media'
        this.emit('speech', responseIndex, base64String, partialResponse, interactionCount);

        chunkIndex++;
      }
    } catch (err) {
      console.error('Error in MinimaxiTTSService:', err);
    }
  }

  /**
   * Fetch Minimaxi TTS: raw PCM @ 8 kHz, 16-bit, 1 channel.
   * Minimaxi returns hex-coded PCM => convert to a Buffer.
   */
  async _fetchMinimaxiPCM(text) {
    const groupId = process.env.GROUP_ID;
    const minimaxiUrl = `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${groupId}`;

    const ttsPayload = {
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
        sample_rate: 8000, // 8 kHz
        format: 'pcm',     // raw PCM
        channel: 1
      }
    };

    const response = await fetch(minimaxiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY}`
      },
      body: JSON.stringify(ttsPayload),
    });

    if (!response.ok) {
      console.error('Minimaxi TTS error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    if (!data?.data?.audio) {
      console.error('No audio found in Minimaxi TTS response:', JSON.stringify(data, null, 2));
      return null;
    }

    // Minimaxi returns the PCM data as hex => convert to a Buffer
    return Buffer.from(data.data.audio, 'hex');
  }
}

// -- 6) CommonJS export, so you can `const { MinimaxiTTSService } = require('./path')`
module.exports = { MinimaxiTTSService };
