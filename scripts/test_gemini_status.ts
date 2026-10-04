import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testGemini() {
  const apiKey = process.env.AI_API_KEY;
  console.log('API Key exists:', Boolean(apiKey), 'starts with:', apiKey?.substring(0, 8));
  if (!apiKey) return;
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const res = await model.generateContent('Say hello in one word');
    console.log('Gemini 1.5 Flash result:', res.response.text().trim());
  } catch (err: any) {
    console.error('Gemini 1.5 Flash error:', err.message);
  }

  try {
    const model36 = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
    const res36 = await model36.generateContent('Say hello in one word');
    console.log('Gemini 3.6 Flash result:', res36.response.text().trim());
  } catch (err: any) {
    console.error('Gemini 3.6 Flash error:', err.message);
  }
}

testGemini().catch(console.error);
