// Required libraries for colored logs, Deepgram SDK, and event handling
require('colors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
 constructor() {
   super();
   // Set up connection to Deepgram with API key
   const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

   // Configure live transcription settings
   this.dgConnection = deepgram.listen.live({
     encoding: 'mulaw',             // Audio encoding type
     sample_rate: '8000',           // Phone call quality
     model: 'nova-2',               // Deepgram model to use
     punctuate: true,               // Add punctuation
     interim_results: true,         // Get partial results
     endpointing: 200,              // Detect speech endings
     utterance_end_ms: 1000         // Wait time for utterance end
   });

   this.finalResult = '';           // Store complete transcription
   this.speechFinal = false;        // Track if speaker has finished naturally

   // When connection opens, set up all event handlers
   this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
     // Handle incoming transcription chunks
     this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
       const alternatives = transcriptionEvent.channel?.alternatives;
       let text = '';
       if (alternatives) {
         text = alternatives[0]?.transcript;
       }

       // Handle end of utterance (speaker stopped talking)
       if (transcriptionEvent.type === 'UtteranceEnd') {
         if (!this.speechFinal) {
           console.log(`UtteranceEnd received before speechFinal, emit the text collected so far: ${this.finalResult}`.yellow);
           this.emit('transcription', this.finalResult);
           return;
         } else {
           console.log('STT -> Speech was already final when UtteranceEnd recevied'.yellow);
           return;
         }
       }

       // Handle final transcription pieces
       if (transcriptionEvent.is_final === true && text.trim().length > 0) {
         this.finalResult += ` ${text}`;

         // If speaker made a natural pause, send the transcription
         if (transcriptionEvent.speech_final === true) {
           this.speechFinal = true;  // Prevent duplicate sends
           this.emit('transcription', this.finalResult);
           this.finalResult = '';
         } else {
           // Reset for next utterance
           this.speechFinal = false;
         }
       } else {
         // Emit interim results for real-time feedback
         this.emit('utterance', text);
       }
     });

     // Error handling events
     this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
       console.error('STT -> deepgram error');
       console.error(error);
     });

     this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
       console.error('STT -> deepgram warning');
       console.error(warning);
     });

     this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
       console.error('STT -> deepgram metadata');
       console.error(metadata);
     });

     this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
       console.log('STT -> Deepgram connection closed'.yellow);
     });
   });
 }

 // Send audio data to Deepgram for transcription
 send(payload) {
   if (this.dgConnection.getReadyState() === 1) {  // Check if connection is open
     this.dgConnection.send(Buffer.from(payload, 'base64'));
   }
 }
}

module.exports = { TranscriptionService };