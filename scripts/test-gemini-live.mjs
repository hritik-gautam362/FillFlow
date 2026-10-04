import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

console.log('AI_API_KEY present:', Boolean(process.env.AI_API_KEY));
console.log('AI_MODEL configured in .env:', process.env.AI_MODEL);

const apiKey = process.env.AI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelName) {
  console.log(`\nTesting model: "${modelName}"...`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Say hello');
    console.log(`SUCCESS for "${modelName}":`, result.response.text().trim());
    return true;
  } catch (err) {
    console.error(`FAILED for "${modelName}":`, err.message);
    return false;
  }
}

async function main() {
  const envModel = process.env.AI_MODEL || 'gemini-flash-lite-latest';
  const ok1 = await testModel(envModel);
  if (!ok1) {
    console.log('\nTrying fallback model names:');
    await testModel('gemini-2.5-flash');
    await testModel('gemini-2.0-flash');
    await testModel('gemini-1.5-flash');
  }
}

main();
