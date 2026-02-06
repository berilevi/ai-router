/**
 * Basic usage example for Gemini-Ollama Bridge
 * 
 * This example shows how to use the bridge with the Ollama JavaScript client
 * or direct HTTP requests.
 */

const OLLAMA_URL = 'http://localhost:11434';

// Example 1: List available models
async function listModels() {
  console.log('=== Listing Available Models ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    
    console.log('Available models:');
    data.models.forEach(model => {
      console.log(`  - ${model.name} (${model.details.family})`);
    });
    
    return data.models;
  } catch (error) {
    console.error('Error listing models:', error.message);
  }
}

// Example 2: Generate text completion
async function generateCompletion() {
  console.log('\n=== Generating Completion ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-flash',
        prompt: 'Explain quantum computing in simple terms:',
        stream: false,
        options: {
          temperature: 0.7,
        },
      }),
    });
    
    const data = await response.json();
    console.log('Response:', data.response);
    console.log('Model:', data.model);
    console.log('Tokens:', data.eval_count);
    
    return data;
  } catch (error) {
    console.error('Error generating completion:', error.message);
  }
}

// Example 3: Stream text completion
async function streamCompletion() {
  console.log('\n=== Streaming Completion ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-pro',
        prompt: 'Write a short poem about AI:',
        stream: true,
      }),
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    console.log('Streaming response:');
    let fullResponse = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            process.stdout.write(data.response);
            fullResponse += data.response;
          }
          if (data.done) {
            console.log('\n[Stream complete]');
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
    
    return fullResponse;
  } catch (error) {
    console.error('Error streaming completion:', error.message);
  }
}

// Example 4: Chat completion
async function chatCompletion() {
  console.log('\n=== Chat Completion ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful coding assistant.',
          },
          {
            role: 'user',
            content: 'How do I reverse a string in JavaScript?',
          },
        ],
        stream: false,
      }),
    });
    
    const data = await response.json();
    console.log('Assistant:', data.message.content);
    
    return data;
  } catch (error) {
    console.error('Error in chat completion:', error.message);
  }
}

// Example 5: Generate embeddings
async function generateEmbeddings() {
  console.log('\n=== Generating Embeddings ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-flash',
        input: 'The quick brown fox jumps over the lazy dog',
      }),
    });
    
    const data = await response.json();
    console.log('Embedding dimensions:', data.embeddings[0].length);
    console.log('First 5 values:', data.embeddings[0].slice(0, 5));
    
    return data;
  } catch (error) {
    console.error('Error generating embeddings:', error.message);
  }
}

// Example 6: Health check
async function healthCheck() {
  console.log('\n=== Health Check ===');
  
  try {
    const response = await fetch(`${OLLAMA_URL}/health`);
    const data = await response.json();
    
    console.log('Status:', data.status);
    console.log('Providers:', data.providers.map(p => p.name).join(', '));
    console.log('Available models:', data.models.total);
    
    return data;
  } catch (error) {
    console.error('Error checking health:', error.message);
  }
}

// Run all examples
async function runExamples() {
  console.log('Gemini-Ollama Bridge Examples\n');
  console.log(`Connecting to: ${OLLAMA_URL}\n`);
  
  // Check if server is running
  try {
    await healthCheck();
  } catch (error) {
    console.error('Cannot connect to server. Please make sure the bridge is running.');
    console.error('Run: npm start');
    process.exit(1);
  }
  
  await listModels();
  await generateCompletion();
  await streamCompletion();
  await chatCompletion();
  await generateEmbeddings();
  
  console.log('\n=== All examples completed ===');
}

// Run if called directly
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  listModels,
  generateCompletion,
  streamCompletion,
  chatCompletion,
  generateEmbeddings,
  healthCheck,
};
