/**
 * Controlled Live Gemini E2E Verification Script
 *
 * Exercises a controlled minimal number of REAL live Gemini API calls (<= 3):
 * 1. Ambiguous business inquiry classification (Layer 3 lightweight AI classifier)
 * 2. Genuine customer service inquiry response (Answers actual question first, no robotic questionnaire)
 * 3. Contextual follow-up response (Anti-repetition: does NOT re-ask budget, timeline, or project type)
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

// Always use 'ws' in Node.js environment
neonConfig.webSocketConstructor = ws;

import { callGeminiRequirementAgent, getRealGeminiCallCount, resetRealGeminiCallCount, clearGeminiMockHandler } from '../src/lib/ai/gemini.ts';
import { classifyInboundEmail, clearAiClassifierMockHandler } from '../src/lib/services/email/emailClassifier.ts';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator.ts';

// Ensure all mocks are cleared for live testing
clearGeminiMockHandler();
clearAiClassifierMockHandler();
resetRealGeminiCallCount();

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAILED: ${description}`);
  }
}

async function runLiveGeminiTests() {
  console.log('\n========================================================================');
  console.log('       CONTROLLED LIVE GEMINI VERIFICATION (MAX 3 REAL CALLS)           ');
  console.log('========================================================================\n');

  // Check that API key is present
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'your_gemini_api_key_here') {
    console.warn('⚠️ AI_API_KEY not configured. Skipping live Gemini test.');
    return;
  }

  // -------------------------------------------------------------------------
  // 1. Ambiguous Business Inquiry Classification (Layer 3 AI Classifier)
  // -------------------------------------------------------------------------
  console.log('[Live Test 1] Ambiguous inquiry classification via Layer 3 Gemini');
  try {
    const ambiguousEmail = {
      messageId: `live-ambig-${Date.now()}`,
      sender: 'director@enterprisegrowth.co',
      senderName: 'Director Smith',
      recipient: 'info@firm.com',
      subject: 'Exploring collaborative synergies for upcoming quarter',
      text: 'Hello team, we have been following your recent developments and would like to explore potential synergies and collaborative opportunities with your team.',
      timestamp: Date.now(),
    };

    const classResult = await classifyInboundEmail(ambiguousEmail, [], {
      name: 'Apex Solutions',
      industry: 'Business Technology Consulting',
    });

    console.log('  Live Classifier Result:', JSON.stringify(classResult));
    assert(classResult.classification === 'CUSTOMER_INQUIRY', 'Classified as CUSTOMER_INQUIRY');
    assert(classResult.requiresReply === true, 'Requires reply');
    assert(Boolean(classResult.intent), `Intent identified: ${classResult.intent}`);
  } catch (err) {
    console.error('  ❌ Live Test 1 failed:', err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // 2. Genuine Service Inquiry Response (Answers actual question first)
  // -------------------------------------------------------------------------
  console.log('\n[Live Test 2] Genuine service inquiry response generation');
  try {
    const companyContext = {
      name: 'Apex Construction & Interiors',
      industry: 'Commercial Construction & Interior Renovation',
      services: ['Commercial Renovations', 'Architectural Planning', 'Turnkey Fit-Outs'],
      description: 'Award-winning commercial interior design and general contracting firm.',
    };

    const liveOutput = await callGeminiRequirementAgent({
      history: [],
      latestMessage: 'Hi, I want to know what services you guys provide?',
      companyContext,
    });

    console.log('  Live Model Reply:', liveOutput.reply);
    console.log('  Conversation State:', liveOutput.conversationState);

    const validation = validateCustomerResponse({
      reply: liveOutput.reply,
      clientMessage: 'Hi, I want to know what services you guys provide?',
      history: [],
    });

    assert(validation.isValid, 'Live reply passes safety and quality validator');
    assert(!validation.isGeneric, 'Live reply is not generic canned boilerplate');

    const replyLower = liveOutput.reply.toLowerCase();
    const answersServices =
      replyLower.includes('renovation') ||
      replyLower.includes('construction') ||
      replyLower.includes('fit-out') ||
      replyLower.includes('architectural') ||
      replyLower.includes('service') ||
      replyLower.includes('contracting');

    assert(answersServices, 'Live reply directly addresses company services');

    // Ensure it does NOT force rigid software form
    const isForm =
      replyLower.includes('core features') &&
      replyLower.includes('target audience') &&
      replyLower.includes('tech stack');
    assert(!isForm, 'Live reply does NOT force a rigid software requirements form');
  } catch (err) {
    console.error('  ❌ Live Test 2 failed:', err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // 3. Contextual Follow-up (Anti-repetition: doesn't re-ask known budget/timeline)
  // -------------------------------------------------------------------------
  console.log('\n[Live Test 3] Contextual follow-up response (Anti-repetition)');
  try {
    const history = [
      { sender: 'client', text: 'I need a website for my construction company.' },
      {
        sender: 'agent',
        text: "We'd be glad to help build a website for your construction company. Could you share your estimated budget and target timeline?",
      },
    ];

    const knownReqs = {
      projectType: 'Website for construction company',
      budget: '₹5,000',
      timeline: 'before 4th November 2026',
    };

    const followupOutput = await callGeminiRequirementAgent({
      history,
      latestMessage: 'My budget is around ₹5,000 and I need it before 4th November 2026.',
      previousRequirements: knownReqs,
      companyContext: {
        name: 'Apex Web Studio',
        industry: 'Web Design & Digital Solutions',
      },
    });

    console.log('  Live Follow-up Reply:', followupOutput.reply);

    const validation = validateCustomerResponse({
      reply: followupOutput.reply,
      clientMessage: 'My budget is around ₹5,000 and I need it before 4th November 2026.',
      history,
      knownRequirements: knownReqs,
    });

    assert(validation.isValid, 'Follow-up reply passes safety and anti-repetition validator');
    assert(!validation.hasRepeatedQuestion, 'Validator confirms no repeated question');

    const replyLower = followupOutput.reply.toLowerCase();
    const asksBudgetAgain =
      replyLower.includes('what is your budget') ||
      replyLower.includes("what's your budget") ||
      replyLower.includes('how much can you spend');
    assert(!asksBudgetAgain, 'Live reply does NOT ask for budget again');

    const asksTimelineAgain =
      replyLower.includes('what is your timeline') ||
      replyLower.includes('when do you need this completed') ||
      replyLower.includes('what is your deadline');
    assert(!asksTimelineAgain, 'Live reply does NOT ask for timeline again');
  } catch (err) {
    console.error('  ❌ Live Test 3 failed:', err.message);
    failed++;
  }

  // -------------------------------------------------------------------------
  // Final Call Budget Accounting
  // -------------------------------------------------------------------------
  const realCalls = getRealGeminiCallCount();
  console.log('\n========================================================================');
  console.log(`REAL_GEMINI_CALLS=${realCalls}`);
  console.log(`Total Passed: ${passed}, Failed: ${failed}`);
  console.log('========================================================================\n');

  assert(realCalls <= 3, `Controlled test made <= 3 real Gemini calls (Actual: ${realCalls})`);

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveGeminiTests().catch((err) => {
  console.error('Fatal live test runner error:', err);
  process.exit(1);
});
