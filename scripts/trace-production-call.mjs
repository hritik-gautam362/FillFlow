import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma.ts';
import { callGeminiRequirementAgent } from '../src/lib/ai/gemini.ts';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator.ts';
import { validateAndNormalizeModelOutput } from '../src/lib/ai/validator.ts';

async function main() {
  const leadId = 'cmu9rzlx6000fu4lsml3ktayz';
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { company: true }
  });

  const rawHistory = await prisma.chatMessage.findMany({
    where: { leadId },
    orderBy: { createdAt: 'asc' }
  });

  // Up to message 15 (which is the client message)
  const historyBefore15 = rawHistory.slice(0, 14).map(m => ({
    sender: m.sender,
    text: m.text
  }));

  const msg15 = rawHistory[14];
  console.log('MSG 15 TEXT:', msg15.text);
  console.log('MSG 15 SNAPSHOT:', msg15.extractedDataSnapshot);

  const previousRequirements = {
    projectType: 'professional website',
    budget: '₹15,000,',
    timeline: '',
    clientName: 'Hritik Gautam'
  };

  const companyContext = {
    companyId: lead.companyId,
    name: 'Evores',
    industry: 'IT Services',
    services: undefined,
  };

  console.log('\n--- SIMULATING VALIDATE AND NORMALIZE WITH NULL (FALLBACK) ---');
  const fallback = validateAndNormalizeModelOutput(
    null,
    previousRequirements,
    companyContext,
    msg15.text,
    'project_request',
    'business',
    historyBefore15
  );
  console.log('\n--- CALLING REAL GEMINI REQUIREMENT AGENT ---');
  try {
    const geminiOutput = await callGeminiRequirementAgent({
      history: historyBefore15,
      latestMessage: msg15.text,
      previousRequirements,
      companyContext,
      intent: 'project_request',
      subject: 'business',
      sender: 'hritikgautam362@gmail.com'
    });
    console.log('GEMINI OUTPUT:', {
      reply: geminiOutput.reply,
      state: geminiOutput.conversationState,
      requiresReply: geminiOutput.requiresReply,
      clientQuestionAnswered: geminiOutput.clientQuestionAnswered,
      nextBestQuestion: geminiOutput.nextBestQuestion,
      usedFallback: geminiOutput.usedFallback,
      fallbackReason: geminiOutput.fallbackReason,
      req: geminiOutput.extractedRequirements
    });

    const validation = validateCustomerResponse({
      reply: geminiOutput.reply,
      clientMessage: msg15.text,
      history: historyBefore15,
      knownRequirements: geminiOutput.extractedRequirements,
      requiresReply: geminiOutput.requiresReply,
      intent: 'project_request',
      subject: 'business',
    });
    console.log('VALIDATION RESULT:', validation);
  } catch (err) {
    console.error('GEMINI CALL ERROR:', err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

