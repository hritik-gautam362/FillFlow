import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function listModels() {
  const apiKey = process.env.AI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  if (data.models) {
    console.log('Available models:');
    for (const m of data.models) {
      if (m.supportedGenerationMethods?.includes('generateContent')) {
        console.log(' -', m.name);
      }
    }
  } else {
    console.log('Error listing models:', data);
  }
}

listModels().catch(console.error);
