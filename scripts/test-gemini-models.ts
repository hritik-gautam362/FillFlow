import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY!);
  for (const m of ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent('Hello! Answer in 3 words:');
      console.log(`Model ${m} SUCCESS:`, res.response.text());
    } catch (e: any) {
      console.log(`Model ${m} FAILED:`, e.message);
    }
  }
}
test();
