require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

class MinimaxiTTSService extends EventEmitter {
  constructor() {
    super();
  }

  async convertAudio(buffer) {
    return new Promise((resolve, reject) => {
      const tempDir = os.tmpdir();

      // Determine if the input buffer is a full WAV file (with RIFF header)
      // or raw PCM. (WAV files start with "52494646" i.e. "RIFF")
      let isWav = false;
      const header = buffer.slice(0, 4).toString('hex');
      if (header === '52494646') {
        isWav = true;
      }
      // Use a file extension based on the input type.
      const inputExtension = isWav ? '.wav' : '.raw';
      const inputPath = path.join(tempDir, `minimaxi-input-${Date.now()}${inputExtension}`);
      const outputPath = path.join(tempDir, `minimaxi-output-${Date.now()}.wav`);

      try {
        fs.writeFileSync(inputPath, buffer);
      } catch (err) {
        return reject(err);
      }

      // Build the ffmpeg argument list.
      // For a WAV file, let ffmpeg auto-detect; for raw PCM, specify:
      // - format: s16le, sample rate: 8000, mono.
      let ffmpegArgs = ['-y', '-hide_banner', '-loglevel', 'error'];
      if (isWav) {
        ffmpegArgs.push('-i', inputPath);
      } else {
        ffmpegArgs.push('-f', 's16le', '-ar', '8000', '-ac', '1', '-i', inputPath);
      }
      // Convert to an 8000 Hz, mono, uLaw-encoded (pcm_mulaw) WAV file.
      ffmpegArgs = ffmpegArgs.concat([
        '-ar', '8000',
        '-ac', '1',
        '-acodec', 'pcm_mulaw',
        '-f', 'wav',
        outputPath
      ]);

      execFile('ffmpeg', ffmpegArgs, (error, stdout, stderr) => {
        // Clean up the input file in any case.
        try { fs.unlinkSync(inputPath); } catch (e) { }

        if (error) {
          try { fs.unlinkSync(outputPath); } catch (e) { }
          return reject(new Error(`FFmpeg error: ${stderr || error.message}`));
        }

        fs.readFile(outputPath, (err, data) => {
          try { fs.unlinkSync(outputPath); } catch (e) { }
          if (err) return reject(err);
          // Return the converted audio as a base64 string.
          resolve(data.toString('base64'));
        });
      });
    });
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    const ttsPayload = {
      model: 'speech-01-turbo',
      text: partialResponse,
      stream: false,
      voice_setting: {
        voice_id: 'moss_audio_a7c066a3-dd74-11ef-befa-5ed23b965939',
        speed: 1.2,
        vol: 0.8
      },
      audio_setting: {
        sample_rate: 8000,
        format: 'pcm' // Request PCM output
      }
    };

    try {
      const response = await fetch(
        `https://api.minimaxi.chat/v1/t2a_v2?GroupId=${process.env.GROUP_ID}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY}`,
          },
          body: JSON.stringify(ttsPayload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        return;
      }

      const responseData = await response.json();

      if (!responseData?.data?.audio) {
        console.error('No audio data in response', responseData);
        return;
      }

      // Since we're requesting PCM (raw) output, we expect the audio data to be a hex-encoded string.
      // (If it were WAV, it would be base64 encoded.)
      let audioBuffer;
      const audioFormat = responseData.extra_info?.audio_format;
      if (audioFormat === 'pcm') {
        if (/^[0-9a-fA-F]+$/.test(responseData.data.audio)) {
          audioBuffer = Buffer.from(responseData.data.audio, 'hex');
        } else {
          console.error('Audio data is not in the expected hex format for PCM output');
          return;
        }
      } else {
        // Fallback: if not explicitly PCM, assume base64.
        if (/^[A-Za-z0-9+/]+={0,2}$/.test(responseData.data.audio)) {
          audioBuffer = Buffer.from(responseData.data.audio, 'base64');
        } else {
          console.error('Invalid base64 format');
          return;
        }
      }

      // (Optional) For debugging, save the received audio to a temporary file.
      const debugPath = path.join(
        os.tmpdir(),
        `minimaxi-debug-${Date.now()}.${audioFormat === 'pcm' ? 'raw' : 'wav'}`
      );
      fs.writeFileSync(debugPath, audioBuffer);

      try {
        const ulawBuffer = await this.convertAudio(audioBuffer);
        this.emit('speech', partialResponseIndex, ulawBuffer, partialResponse, interactionCount);
      } catch (convertError) {
        console.error('Conversion failed:', convertError);
      }
    } catch (err) {
      console.error('MinimaxiTTSService error:', err);
    }
  }
}

module.exports = { MinimaxiTTSService };


