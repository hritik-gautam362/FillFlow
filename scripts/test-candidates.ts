import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY!);
  const candidates = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3.8-flash'
  ];
  for (const m of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      const res = await model.generateContent('{"task": "Respond with JSON: { \\"status\\": \\"ok\\" }"}');
      console.log(`Model ${m} SUCCESS:`, res.response.text());
    } catch (e: any) {
      console.log(`Model ${m} FAILED:`, e.message);
    }
  }
}
test();
