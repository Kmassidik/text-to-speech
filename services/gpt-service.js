// For colored console logs and event handling
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
  // Set up the AI assistant with its initial personality and knowledge
  constructor() {
    super();
    this.openai = new OpenAI();
    this.userContext = [
      // Initial instructions and info for the AI
      {
        "role": "system",
        "content": `Anda adalah asisten yang membantu untuk CyberSpare. 
      Berikan respons yang singkat namun ramah. Jangan menanyakan lebih dari satu pertanyaan dalam satu waktu. 
      Jika ditanya tentang layanan yang tidak tercantum di bawah ini, jelaskan dengan sopan bahwa kami tidak menawarkan layanan tersebut, 
      tetapi dapat merekomendasikan toko lain.
    
      Informasi Utama:
      - Jam Operasional: Senin hingga Jumat, 9 AM - 5 PM
      - Alamat: Jakarta
      - Layanan: Keamanan Siber
    
      Anda harus menambahkan simbol '•' setiap 5 kata pada jeda alami dalam respons Anda untuk pemisahan dalam text-to-speech. 
      PASTIKAN SELALU MENJAWAB DALAM BAHASA INDONESIA.`
      },

      // Welcome message
      { 'role': 'assistant', 'content': 'Welcome to CyberSpare. • Ada yang bisa kami bantu ?' },
    ],
      this.partialResponseIndex = 0;    // Tracks pieces of response for order
  }

  // Store the call's unique ID
  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  // Add new messages to conversation history
  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }
  }

  // Main function that handles getting responses from GPT
  async completion(text, interactionCount, role = 'user', name = 'user') {
    // Add user's message to conversation history
    this.updateUserContext(name, role, text);

    // Get streaming response from GPT
    const stream = await this.openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages: this.userContext,
      stream: true,
    });

    // Track both complete response and chunks for speaking
    let completeResponse = '';
    let partialResponse = '';

    // Process each piece of GPT's response as it comes
    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let finishReason = chunk.choices[0].finish_reason;

      completeResponse += content;
      partialResponse += content;

      // When we hit a pause marker (•) or the end, send that chunk for speech
      if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
        const gptReply = {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        };
        this.emit('gptreply', gptReply, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }

    // Add GPT's complete response to conversation history
    this.userContext.push({ 'role': 'assistant', 'content': completeResponse });
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };