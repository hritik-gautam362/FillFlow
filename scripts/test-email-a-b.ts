import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { callGeminiRequirementAgent } from '../src/lib/ai/gemini';
import { CompanyContext } from '../src/lib/ai/types';

async function testEmails() {
  const companyContext: CompanyContext = {
    name: 'Evores',
    industry: 'Software Development & IT Consulting',
    services: ['Web Development', 'Mobile App Development', 'Custom Software'],
    description: 'We build modern web and mobile applications for growing businesses.',
  };

  const emailAText = `Hi Evores team,

We are looking for a responsive business website for small and medium-sized businesses.
Key requirements:
- Homepage, service pages, contact form, testimonials, and admin dashboard
- Budget: ₹1,50,000–₹2,00,000
- Timeline: 6–8 weeks

Could you share how we can proceed?`;

  const emailBText = `Hi,

We need an e-commerce website for our clothing brand.
We need product browsing and online ordering.

Please let us know the next steps.`;

  console.log('--- TESTING EMAIL A ---');
  const resA = await callGeminiRequirementAgent({
    history: [],
    latestMessage: emailAText,
    previousRequirements: {},
    companyContext,
    subject: 'Website Development Inquiry',
    intent: 'service_inquiry',
  });

  console.log('\n[Email A Reply]:\n', resA.reply);
  console.log('\n[Email A Extracted]:\n', resA.extractedRequirements);

  console.log('\n--- TESTING EMAIL B ---');
  const resB = await callGeminiRequirementAgent({
    history: [],
    latestMessage: emailBText,
    previousRequirements: {},
    companyContext,
    subject: 'E-commerce Website',
    intent: 'service_inquiry',
  });

  console.log('\n[Email B Reply]:\n', resB.reply);
  console.log('\n[Email B Extracted]:\n', resB.extractedRequirements);
}

testEmails().catch(console.error);
