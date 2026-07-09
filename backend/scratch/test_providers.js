import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

async function main() {
  console.log('Testing Anthropic client structure...');
  try {
    const client = new Anthropic({ apiKey: 'sk-ant-test-key-12345678901234567890' });
    console.log('Anthropic instance created.');
    console.log('Checking if client.models exists:', !!client.models);
    console.log('Checking client.models type:', typeof client.models);
    if (client.models) {
      console.log('Checking client.models.list type:', typeof client.models.list);
    }
  } catch (err) {
    console.error('Anthropic test failed:', err);
  }

  console.log('\nTesting GoogleGenAI client structure...');
  try {
    const ai = new GoogleGenAI({ apiKey: 'AIzaSyTestKey12345678901234567890' });
    console.log('GoogleGenAI instance created.');
    console.log('Checking if ai.models exists:', !!ai.models);
    if (ai.models) {
      console.log('Checking ai.models.generateContent type:', typeof ai.models.generateContent);
      console.log('Checking ai.models.list type:', typeof ai.models.list);
    }
  } catch (err) {
    console.error('GoogleGenAI test failed:', err);
  }
}

main();
