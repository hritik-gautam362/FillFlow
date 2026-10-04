import dotenv from 'dotenv';
dotenv.config();
import { callGeminiRequirementAgent } from '../src/lib/ai/gemini';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { validateAndNormalizeModelOutput } from '../src/lib/ai/validator';

async function test() {
  const history = [
    { sender: 'client' as const, text: "Hi, I'm interested in discussing a partnership with your company. Would 6 PM on 29 September work for a short call?" },
    { sender: 'agent' as const, text: "Hi,\n\nThanks for reaching out to Evores. 6 PM on 29 September works well for us to discuss the partnership and collaboration opportunities.\n\nCould you please confirm your timezone so we can coordinate the calendar invite accordingly?\n\nBest regards,\nEvores" },
  ];
  const latestMessage = "Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?";
  const previousRequirements = {
    projectType: 'website for clothing business',
    budget: '₹20,000',
    timeline: 'by December',
    productCount: 'around 50 products',
  };
  const companyContext = {
    name: 'Evores',
    industry: 'IT Services',
    services: ['IT Services'],
    description: 'Evores provides bespoke IT Services solutions. Pricing depends on project scope and deliverables.',
  };

  console.log('--- CALLING callGeminiRequirementAgent ---');
  try {
    const aiOutput = await callGeminiRequirementAgent({
      history,
      latestMessage,
      previousRequirements,
      companyContext,
      intent: 'partnership',
      subject: 'Partnership Discussion & Call Request',
    });
    console.log('AI OUTPUT REPLY:\n', aiOutput.reply);
    console.log('AI OUTPUT STATE:', aiOutput.conversationState);
    console.log('AI OUTPUT USED FALLBACK:', aiOutput.usedFallback);

    const val = validateCustomerResponse({
      reply: aiOutput.reply,
      clientMessage: latestMessage,
      history,
      knownRequirements: aiOutput.extractedRequirements,
      requiresReply: aiOutput.requiresReply,
      intent: 'partnership',
      subject: 'Partnership Discussion & Call Request',
    });
    console.log('VALIDATION RESULT:', val);
  } catch (err: any) {
    console.error('ERROR:', err.message);
  }
}

test();
