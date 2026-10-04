/**
 * Controlled Live Gemini & Production Self-Healing Verification Suite
 * Phase 20: Tests real production entrypoint callGeminiRequirementAgent
 * Verifies live model and self-healing behavior against canonical business invariants:
 * 1. Pricing inquiry answers pricing methodology first without fabricating numbers
 * 2. Partnership inquiry acknowledges collaboration without software questionnaire
 * 3. Meeting follow-up confirms proposed time without restarting conversation
 */

import dotenv from 'dotenv';
dotenv.config();

import { callGeminiRequirementAgent } from '../src/lib/ai/gemini.ts';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator.ts';

const companyContext = {
  name: 'ApexByte Solutions',
  industry: 'Enterprise Software & Digital Transformation',
  services: ['Custom Software Development', 'Cloud Consulting', 'AI Automation'],
  description: 'ApexByte delivers enterprise-grade software and AI automation solutions.',
  pricingPolicy: 'Project pricing depends on technical scope, feature complexity, and deliverable milestones.'
};

const results = [];

async function runLiveVerification() {
  console.log('============================================================');
  console.log('STARTING PRODUCTION AI & SELF-HEALING VERIFICATION');
  console.log('============================================================\n');

  // TEST 1: Pricing Inquiry
  console.log('--- TEST 1: Service + Pricing Inquiry ---');
  const msg1 = "I am planning to launch an online retail platform and looking for an agency to build it. How much would something like this normally cost? I don't have the exact requirements finalized yet.";

  const output1 = await callGeminiRequirementAgent({
    history: [],
    latestMessage: msg1,
    companyContext,
    intent: 'pricing_request',
    subject: 'Website development inquiry'
  });

  const val1 = validateCustomerResponse({
    reply: output1.reply,
    clientMessage: msg1,
    history: [],
    requiresReply: true,
    intent: 'pricing_request',
    subject: 'Website development inquiry'
  });

  console.log('Reply 1:\n', output1.reply);
  console.log('Validation 1:', val1.isValid ? 'VALID ✓' : `ISSUES: ${val1.issues.join(', ')}`);
  console.log('Used Fallback:', output1.usedFallback, output1.fallbackReason ? `(${output1.fallbackReason})` : '');

  const pricingAddressed = /\b(cost|pricing|depends\s+on|estimate|scope|factors|milestones|range)\b/i.test(output1.reply);
  const noFabricatedPrice = !val1.hasFabricatedPrice;
  const noGenericIntake1 = !output1.reply.toLowerCase().includes('how can we assist you today');
  const passed1 = val1.isValid && pricingAddressed && noFabricatedPrice && noGenericIntake1;
  results.push({ name: 'Pricing Inquiry', passed: passed1, reply: output1.reply });

  // TEST 2: Strategic Partnership
  console.log('\n--- TEST 2: Strategic Partnership Proposal ---');
  const msg2 = "We are a digital marketing agency and would like to explore a strategic partnership to refer mutual clients. Are you open to discussing collaboration opportunities?";

  const output2 = await callGeminiRequirementAgent({
    history: [],
    latestMessage: msg2,
    companyContext,
    intent: 'partnership',
    subject: 'Potential Strategic Partnership'
  });

  const val2 = validateCustomerResponse({
    reply: output2.reply,
    clientMessage: msg2,
    history: [],
    requiresReply: true,
    intent: 'partnership',
    subject: 'Potential Strategic Partnership'
  });

  console.log('Reply 2:\n', output2.reply);
  console.log('Validation 2:', val2.isValid ? 'VALID ✓' : `ISSUES: ${val2.issues.join(', ')}`);
  console.log('Used Fallback:', output2.usedFallback, output2.fallbackReason ? `(${output2.fallbackReason})` : '');

  const partnershipAddressed = /\b(partner|partnership|collaborat|referral|work\s+together)\b/i.test(output2.reply);
  const noGenericIntake2 = !output2.reply.toLowerCase().includes('how can we assist you today') && !output2.reply.toLowerCase().includes('project requirements');
  const passed2 = val2.isValid && partnershipAddressed && noGenericIntake2;
  results.push({ name: 'Partnership Inquiry', passed: passed2, reply: output2.reply });

  // TEST 3: Meeting Time Follow-up in Existing Thread
  console.log('\n--- TEST 3: Meeting Time Proposal Follow-up ---');
  const history3 = [
    { sender: 'client', text: 'We are interested in exploring a strategic partnership with your team.' },
    { sender: 'agent', text: 'Thanks for reaching out! We are very open to discussing strategic partnerships. Would you be open to an introductory call?' }
  ];
  const msg3 = "Would 6 PM on 29 September work instead?";

  const output3 = await callGeminiRequirementAgent({
    history: history3,
    latestMessage: msg3,
    companyContext,
    intent: 'meeting_request',
    subject: 'Re: Potential Strategic Partnership',
    previousRequirements: { projectType: 'Strategic Partnership' }
  });

  const val3 = validateCustomerResponse({
    reply: output3.reply,
    clientMessage: msg3,
    history: history3,
    requiresReply: true,
    intent: 'meeting_request',
    subject: 'Re: Potential Strategic Partnership'
  });

  console.log('Reply 3:\n', output3.reply);
  console.log('Validation 3:', val3.isValid ? 'VALID ✓' : `ISSUES: ${val3.issues.join(', ')}`);
  console.log('Used Fallback:', output3.usedFallback, output3.fallbackReason ? `(${output3.fallbackReason})` : '');

  const timeAcknowledged = /\b(6\s*(?:pm)?|29|september|works?)\b/i.test(output3.reply);
  const conversationContinued = !output3.reply.toLowerCase().includes('what services do you need') && !output3.reply.toLowerCase().includes('how can we assist you today');
  const passed3 = val3.isValid && timeAcknowledged && conversationContinued;
  results.push({ name: 'Meeting Scheduling Follow-up', passed: passed3, reply: output3.reply });

  console.log('\n============================================================');
  console.log('PRODUCTION AI VERIFICATION SUMMARY:');
  console.log(`TEST 1 (Pricing Inquiry): ${passed1 ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`TEST 2 (Partnership Inquiry): ${passed2 ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log(`TEST 3 (Meeting Follow-up): ${passed3 ? 'PASSED ✓' : 'FAILED ❌'}`);
  console.log('============================================================\n');

  const allPassed = passed1 && passed2 && passed3;
  if (!allPassed) {
    console.error('❌ One or more live Gemini verification tests failed.');
    process.exit(1);
  } else {
    console.log('🎉 ALL PRODUCTION AI PIPELINE TESTS PASSED 100%!');
  }
}

runLiveVerification().catch((err) => {
  console.error('Fatal live verification error:', err);
  process.exit(1);
});
