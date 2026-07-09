import './loadEnv.js';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('Advertencia: Falta la variable de entorno OPENAI_API_KEY en backend/.env');
}

export const openai = new OpenAI({
  apiKey: apiKey || '',
});
