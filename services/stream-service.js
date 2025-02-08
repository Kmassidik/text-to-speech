// Handles events and unique IDs for audio streaming
const EventEmitter = require('events');
const uuid = require('uuid');

class StreamService extends EventEmitter {
 // Initialize websocket connection and audio tracking
 constructor(websocket) {
   super();
   this.ws = websocket;
   this.expectedAudioIndex = 0;    // Tracks which audio piece should play next
   this.audioBuffer = {};          // Stores audio pieces that arrive out of order
   this.streamSid = '';           // Unique ID for this call's media stream
 }

 setStreamSid (streamSid) {
   this.streamSid = streamSid;
 }

 // Manages the order of audio playback
 buffer (index, audio) {
   // Welcome message has no index, play immediately
   if(index === null) {
     this.sendAudio(audio);
   } 
   // If this is the next expected piece, play it and check for more
   else if(index === this.expectedAudioIndex) {
     this.sendAudio(audio);
     this.expectedAudioIndex++;

     // Play any stored pieces that are now ready in sequence
     while(Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
       const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
       this.sendAudio(bufferedAudio);
       this.expectedAudioIndex++;
     }
   } 
   // Store future pieces until their turn
   else {
     this.audioBuffer[index] = audio;
   }
 }

 // Actually sends audio to the caller through websocket
 sendAudio (audio) {
   // Send the audio data
   this.ws.send(
     JSON.stringify({
       streamSid: this.streamSid,
       event: 'media',
       media: {
         payload: audio,
       },
     })
   );

   // Create and send a unique marker to track when audio finishes playing
   const markLabel = uuid.v4();
   this.ws.send(
     JSON.stringify({
       streamSid: this.streamSid,
       event: 'mark',
       mark: {
         name: markLabel
       }
     })
   );

   // Let other parts of the system know audio was sent
   this.emit('audiosent', markLabel);
 }
}

module.exports = {StreamService};