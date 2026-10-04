import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const apiKey = process.env.AI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  console.log('AVAILABLE MODELS:');
  if (data.models) {
    for (const m of data.models) {
      if (m.supportedGenerationMethods?.includes('generateContent')) {
        console.log(`- ${m.name} (${m.displayName})`);
      }
    }
  } else {
    console.log(data);
  }
}
test();
