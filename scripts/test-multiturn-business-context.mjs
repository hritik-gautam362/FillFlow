/**
 * FILLFLOW MULTI-TURN BUSINESS CONTEXT & QUALITY TEST SUITE
 *
 * Implements tests 1 through 12 specified in Section 11 of the specification:
 * - TEST 1: Budget retention (₹20,000 and December launch preserved)
 * - TEST 2: Feature retention (online payments and 50 products preserved)
 * - TEST 3: Pricing follow-up (answers pricing/scope, does NOT ask for project again)
 * - TEST 4: Placeholder protection ([Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] not treated as selection)
 * - TEST 5: Checkout placeholder ([Standard / Guest / Multi-step] asks for actual choice)
 * - TEST 6: Combined context (Retains ALL known facts: budget, deadline, clothing business, 50 products, payments)
 * - TEST 7: Context reset prevention (No generic IT Services or "how can we assist you today" after multi-turn)
 * - TEST 8: Latest-question priority (Pricing/scope intent prioritized over generic subject/thread)
 * - TEST 9: Same thread new requirement (Feature continuation, not new inquiry)
 * - TEST 10: Meeting follow-up (Call proposal acknowledged, retains previous project context)
 * - TEST 11: Courtesy close ("Thanks, that's all for now" -> no unnecessary reply)
 * - TEST 12: Duplicate Gmail message idempotency (Same message ID processed once)
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

import { buildStructuredConversationContext } from '../src/lib/ai/conversationMemory.ts';
import { validateAndNormalizeModelOutput } from '../src/lib/ai/validator.ts';
import { validateCustomerResponse, isCourtesyClosing } from '../src/lib/ai/responseValidator.ts';
import { detectPlaceholders, detectPlaceholderHallucinations } from '../src/lib/ai/placeholderDetector.ts';
import { classifyInboundEmail } from '../src/lib/services/email/emailClassifier.ts';
import { isEmailIdInMemory, recordEmailIdInMemory, isMessageAlreadyProcessed } from '../src/lib/services/email/emailInboundService.ts';

const COMPANY_CONTEXT = {
  name: 'Evores',
  industry: 'IT Services',
  services: ['Web Development', 'Custom Software', 'Mobile Apps', 'Cloud Solutions'],
  description: 'A technology consultancy delivering scalable software solutions.',
};

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING MULTI-TURN BUSINESS CONTEXT & RESPONSE QUALITY TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1 — Budget & Timeline Retention
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Budget and Timeline Retention ---');
  {
    const history = [
      { sender: 'client', text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?' },
      { sender: 'agent', text: 'Thanks for reaching out to Evores. With a budget of ₹20,000 targeting launch by December, we can discuss a focused professional website for your clothing business covering the core essentials. Could you let us know what specific key features you would like us to factor in?' }
    ];
    const latestMsg = 'What can you provide?';
    const output = validateAndNormalizeModelOutput(null, undefined, COMPANY_CONTEXT, latestMsg, 'pricing', 'Website for clothing business', history);

    assert(output.extractedRequirements.budget === '₹20,000', 'Budget ₹20,000 is retained in context', `Got: ${output.extractedRequirements.budget}`);
    assert(/december/i.test(output.extractedRequirements.timeline || ''), 'Launch timeline December is retained in context', `Got: ${output.extractedRequirements.timeline}`);
    assert(output.reply.includes('₹20,000') || output.reply.includes('20,000'), 'Response mentions confirmed budget', `Reply: ${output.reply}`);
    assert(/december/i.test(output.reply), 'Response mentions target December launch', `Reply: ${output.reply}`);
  }

  // --------------------------------------------------------------------------
  // TEST 2 — Feature Retention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Feature Retention ---');
  {
    const history = [
      { sender: 'client', text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December.' },
      { sender: 'agent', text: 'Thanks for reaching out. We can build a focused website.' },
      { sender: 'client', text: 'I also need online payments and around 50 products. Would that change the estimate?' },
      { sender: 'agent', text: 'Yes, incorporating online payments and 50 products affects scope.' }
    ];
    const latestMsg = 'Could we add user reviews later?';
    const context = buildStructuredConversationContext({
      history,
      latestMessage: latestMsg,
      companyContext: COMPANY_CONTEXT,
      currentIntent: 'follow_up',
    });

    const hasPayments = context.facts.features.some(f => /payment/i.test(f));
    const hasProducts = context.facts.productCount?.includes('50') || context.facts.features.some(f => /50/i.test(f));

    assert(hasPayments, 'Future context retains online payment gateway requirement');
    assert(hasProducts, 'Future context retains ~50 products requirement');
    assert(context.facts.businessType === 'clothing business', 'Future context retains clothing business domain');
  }

  // --------------------------------------------------------------------------
  // TEST 3 — Pricing Follow-up (Must NOT ask for project again)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Pricing Follow-up ---');
  {
    const history = [
      { sender: 'client', text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December.' },
      { sender: 'agent', text: 'Thanks for reaching out to Evores. We can build a focused store.' }
    ];
    const latestMsg = 'Would online payments and 50 products change the estimate?';
    const output = validateAndNormalizeModelOutput(null, undefined, COMPANY_CONTEXT, latestMsg, 'pricing', 'Re: busi', history);

    assert(output.reply.toLowerCase().includes('scope') || output.reply.toLowerCase().includes('estimate'), 'Directly addresses scope/estimate impact');
    assert(!output.reply.toLowerCase().includes('could you share a bit more detail about your project'), 'Does NOT ask for project details again');
    assert(!output.reply.toLowerCase().includes('what are you looking to achieve'), 'Does NOT reset to generic project intake');

    const validation = validateCustomerResponse({
      reply: output.reply,
      clientMessage: latestMsg,
      history,
      knownRequirements: output.extractedRequirements,
      intent: 'pricing',
    });
    assert(validation.isValid, 'Response passes all validation checks', JSON.stringify(validation.issues));
  }

  // --------------------------------------------------------------------------
  // TEST 4 — Placeholder Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Placeholder Protection ---');
  {
    const clientMsg = 'I prefer [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] for the payment integration.';
    const detected = detectPlaceholders(clientMsg);
    assert(detected.length >= 1, 'Detects bracketed placeholder options', `Found ${detected.length}`);

    const hallucinatedReply = 'Since you chose Razorpay, we will proceed with that.';
    const hallucinations = detectPlaceholderHallucinations(hallucinatedReply, clientMsg);
    assert(hallucinations.length > 0, 'Detects and flags hallucinated placeholder selection');

    const cleanReply = 'Thanks for clarifying. A payment gateway will add technical scope to the store. Which payment gateway are you planning to use?';
    const cleanHallucinations = detectPlaceholderHallucinations(cleanReply, clientMsg);
    assert(cleanHallucinations.length === 0, 'Does NOT flag clean consultative question asking client for choice');
  }

  // --------------------------------------------------------------------------
  // TEST 5 — Checkout Placeholder
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Checkout Placeholder ---');
  {
    const clientMsg = 'For the checkout flow, I am looking for a simple [Standard / Guest / Multi-step] checkout process.';
    const detected = detectPlaceholders(clientMsg);
    assert(detected.length >= 1, 'Detects slash-separated checkout placeholder options');

    const falseChoiceReply = 'Since you opted for Guest checkout, we will set up the flow accordingly.';
    const hallucinations = detectPlaceholderHallucinations(falseChoiceReply, clientMsg);
    assert(hallucinations.length > 0, 'Flags hallucinated checkout choice (Guest checkout)');

    const history = [
      { sender: 'client', text: 'Hi, I need an online store for clothing. Budget is ₹20,000 by December.' },
      { sender: 'agent', text: 'We can discuss a focused build.' }
    ];
    const output = validateAndNormalizeModelOutput(null, undefined, COMPANY_CONTEXT, clientMsg, 'follow_up', 'Re: busi', history);
    assert(output.reply.toLowerCase().includes('standard') || output.reply.toLowerCase().includes('guest') || output.reply.toLowerCase().includes('checkout'), 'Prompted customer to clarify checkout preference');
  }

  // --------------------------------------------------------------------------
  // TEST 6 — Combined Context Across All Turns
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Combined Context Retention ---');
  {
    const history = [
      { sender: 'client', text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December.' },
      { sender: 'agent', text: 'Thanks for reaching out to Evores. With a budget of ₹20,000 targeting launch by December, we can discuss a focused store.' },
      { sender: 'client', text: 'I also need online payments and around 50 products. Would that change the estimate?' },
      { sender: 'agent', text: 'Yes, incorporating online payments and 50 products affects scope.' }
    ];
    const latestMsg = 'I would prefer [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] and [Standard / Guest / Multi-step] checkout. Please let me know how this impacts the overall estimate and scope for our December launch.';

    const context = buildStructuredConversationContext({
      history,
      latestMessage: latestMsg,
      companyContext: COMPANY_CONTEXT,
      currentIntent: 'pricing',
      subject: 'Re: busi'
    });

    assert(context.facts.budget === '₹20,000', 'Combined context retains budget ₹20,000');
    assert(Boolean(context.facts.timeline && /december/i.test(context.facts.timeline)), 'Combined context retains December launch');
    assert(context.facts.businessType === 'clothing business', 'Combined context retains clothing business');
    assert(context.facts.productCount?.includes('50') || context.facts.features.some(f => f.includes('50')), 'Combined context retains 50 products');
    assert(context.facts.features.some(f => /payment/i.test(f)), 'Combined context retains payments');
    assert(context.unresolvedPlaceholders.length === 2, 'Combined context tracks 2 unresolved placeholders', `Found: ${context.unresolvedPlaceholders.length}`);
  }

  // --------------------------------------------------------------------------
  // TEST 7 — Context Reset Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Context Reset Prevention ---');
  {
    const history = [
      { sender: 'client', text: 'Need a clothing store website, ₹20k budget, December launch.' },
      { sender: 'agent', text: 'We can build that core store for you.' },
      { sender: 'client', text: 'Adding online payments and 50 products.' },
      { sender: 'agent', text: 'Noted, that expands scope.' },
      { sender: 'client', text: 'Also want customer accounts.' },
      { sender: 'agent', text: 'Confirmed accounts can be included.' }
    ];
    const latestMsg = 'Please confirm the final scope outline for December.';

    const output = validateAndNormalizeModelOutput(null, undefined, COMPANY_CONTEXT, latestMsg, 'follow_up', 'Re: busi', history);

    const badPatterns = [
      'how can we assist you today',
      'could you share more details about your project',
      'could you share a bit more detail about your project',
      'we provide it services solutions',
      'what are you looking to achieve',
      'what services do you need'
    ];

    const lowerReply = output.reply.toLowerCase();
    for (const pat of badPatterns) {
      assert(!lowerReply.includes(pat), `Response does NOT contain forbidden reset phrase: "${pat}"`);
    }

    const valResult = validateCustomerResponse({
      reply: output.reply,
      clientMessage: latestMsg,
      history,
      knownRequirements: output.extractedRequirements,
    });
    assert(valResult.isValid, 'Contextual response is valid and non-generic');
  }

  // --------------------------------------------------------------------------
  // TEST 8 — Latest-Question Priority in Classifier
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Latest-Question Priority in Classification ---');
  {
    const threadContext = {
      hasActiveConversation: true,
      previousIntent: 'service_inquiry',
      conversationTopic: 'website for clothing business',
      knownRequirements: {
        budget: '₹20,000',
        timeline: 'by December',
        projectType: 'website for clothing business',
      }
    };

    const classification = await classifyInboundEmail(
      'Re: busi',
      'Would the payment integration and 50 products change the estimate?',
      threadContext
    );

    const isPricingIntent = classification.intent === 'pricing_request' || classification.intent === 'pricing_inquiry' || classification.intent === 'pricing';
    assert(isPricingIntent, 'Classified as pricing/estimate intent despite subject "Re: busi"', `Got: ${classification.intent}`);
    assert(classification.requiresReply === true, 'Requires reply is true for pricing question');
  }

  // --------------------------------------------------------------------------
  // TEST 9 — Same Thread, New Requirement
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Same Thread, New Requirement ---');
  {
    const history = [
      { sender: 'client', text: 'Hi, I need a clothing website.' },
      { sender: 'agent', text: 'We can help with that.' }
    ];
    const latestMsg = 'I also need customer login and order tracking.';

    const classification = await classifyInboundEmail(
      'Re: clothing website',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'service_inquiry' }
    );

    assert(classification.intent === 'follow_up', 'Classified as follow_up continuation, NOT new general inquiry', `Got: ${classification.intent}`);

    const output = validateAndNormalizeModelOutput(null, undefined, COMPANY_CONTEXT, latestMsg, classification.intent, 'Re: clothing website', history);
    assert(output.reply.toLowerCase().includes('customer login') || output.reply.toLowerCase().includes('order tracking'), 'Acknowledges customer login and order tracking');
    assert(output.reply.toLowerCase().includes('following up') || output.reply.toLowerCase().includes('yes'), 'Continues conversation smoothly');
  }

  // --------------------------------------------------------------------------
  // TEST 10 — Meeting Follow-up Retains Context
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Meeting Follow-up Retains Context ---');
  {
    const history = [
      { sender: 'client', text: 'Hi, interested in exploring a strategic referral partnership.' },
      { sender: 'agent', text: 'We are definitely open to discussing mutual collaboration. Would you like to schedule an introductory call?' }
    ];
    const latestMsg = 'Can we have a call at 5 PM on 28 September?';

    const classification = await classifyInboundEmail(
      'Re: Partnership Proposal',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'partnership_inquiry' }
    );

    assert(classification.intent === 'meeting_request', 'Classified as meeting_request', `Got: ${classification.intent}`);

    const output = validateAndNormalizeModelOutput(null, { projectType: 'Strategic Partnership' }, COMPANY_CONTEXT, latestMsg, classification.intent, 'Re: Partnership Proposal', history);
    assert(output.reply.toLowerCase().includes('5 pm') || output.reply.toLowerCase().includes('28 september'), 'Confirms call date/time');
    assert(output.reply.toLowerCase().includes('timezone'), 'Asks for timezone to coordinate calendar invite');
    assert(!output.reply.toLowerCase().includes('would you like to schedule an introductory call'), 'Does NOT ask if they want a call when already scheduling one');
  }

  // --------------------------------------------------------------------------
  // TEST 11 — Courtesy Close (No unnecessary reply)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Courtesy Close ---');
  {
    const courtesyMsgs = [
      "Thanks, that's all for now.",
      "Thank you! Got it.",
      "Okay, thanks.",
      "Sounds good, thank you!"
    ];

    for (const msg of courtesyMsgs) {
      assert(isCourtesyClosing(msg), `isCourtesyClosing correctly detects: "${msg}"`);
    }

    const classification = await classifyInboundEmail(
      'Re: Scope update',
      "Thanks, that's all for now.",
      { hasActiveConversation: true, previousIntent: 'follow_up' }
    );
    assert(classification.requiresReply === false, 'Classifier marks courtesy close requiresReply = false');
  }

  // --------------------------------------------------------------------------
  // TEST 12 — Duplicate Gmail Message Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 12: Duplicate Gmail Message Idempotency ---');
  {
    const testMsgId = `gmail-multiturn-test-${Date.now()}`;

    // First processing
    const isDupFirst = isEmailIdInMemory(testMsgId);
    assert(!isDupFirst, 'First inbound message is NOT in memory idempotency cache');

    // Record it as completed
    recordEmailIdInMemory(testMsgId);

    // Second processing (same message ID)
    const isDupSecond = isEmailIdInMemory(testMsgId);
    assert(isDupSecond, 'Second inbound message with same ID is detected as DUPLICATE in cache');

    const isProcessedInDb = await isMessageAlreadyProcessed(testMsgId, testMsgId);
    assert(isProcessedInDb, 'isMessageAlreadyProcessed returns true for cached message ID');
  }

  // --------------------------------------------------------------------------
  // TEST 13 — Exact Failure Regression: Pre-meeting Question in Active Thread
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 13: Exact Failure Regression (Pre-meeting Question in Active Thread) ---');
  {
    const history = [
      { sender: 'client', text: "Hi, I'm interested in discussing a partnership with your company. Would 6 PM on 29 September work for a short call?" },
      { sender: 'agent', text: "Hi,\n\nThanks for reaching out to Evores. 6 PM on 29 September works well for us to discuss the partnership and collaboration opportunities.\n\nCould you please confirm your timezone so we can coordinate the calendar invite accordingly?\n\nBest regards,\nEvores" }
    ];
    const latestMsg = "Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?";

    const classification = await classifyInboundEmail(
      'Re: Partnership Discussion & Call Request',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'meeting_request' }
    );

    assert(classification.intent !== 'meeting_request', 'Does NOT falsely classify as meeting_request', `Got: ${classification.intent}`);
    assert(classification.intent === 'partnership' || classification.intent === 'information_request', 'Classified as partnership or information_request', `Got: ${classification.intent}`);

    const output = validateAndNormalizeModelOutput(
      null,
      { projectType: 'Strategic Partnership' },
      COMPANY_CONTEXT,
      latestMsg,
      classification.intent,
      'Re: Partnership Discussion & Call Request',
      history
    );

    const lowerReply = output.reply.toLowerCase();
    assert(lowerReply.includes('agencies outside india') || lowerReply.includes('outside india') || lowerReply.includes('globally') || lowerReply.includes('international'), 'Directly addresses working with agencies outside India');
    assert(!lowerReply.includes('could you please confirm your timezone'), 'Does NOT ask for timezone from previous meeting discussion');
    assert(!lowerReply.includes('what services are you looking for'), 'Does NOT ask generic project intake questions');

    const validation = validateCustomerResponse({
      reply: output.reply,
      clientMessage: latestMsg,
      history,
      knownRequirements: output.extractedRequirements,
      requiresReply: output.requiresReply,
      intent: classification.intent,
      subject: 'Re: Partnership Discussion & Call Request',
    });

    assert(validation.isValid, 'Validation passes for pre-meeting agency question', `Issues: ${validation.issues.join('; ')}`);
  }

  // --------------------------------------------------------------------------
  // TEST 14 — Topic Shift: Customer shifts from Scheduling to Pricing
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 14: Topic Shift (Scheduling to Pricing) ---');
  {
    const history = [
      { sender: 'client', text: 'Would tomorrow at 3 PM work for a call?' },
      { sender: 'agent', text: 'Tomorrow at 3 PM works. Could you confirm your timezone?' }
    ];
    const latestMsg = 'Before we book that call, what are your typical hourly rates?';

    const classification = await classifyInboundEmail(
      'Re: Consultation',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'meeting_request' }
    );

    assert(classification.intent === 'pricing_request', 'Classified as pricing_request instead of meeting_request', `Got: ${classification.intent}`);

    const output = validateAndNormalizeModelOutput(
      null,
      undefined,
      COMPANY_CONTEXT,
      latestMsg,
      classification.intent,
      'Re: Consultation',
      history
    );

    const lowerReply = output.reply.toLowerCase();
    assert(lowerReply.includes('price') || lowerReply.includes('pricing') || lowerReply.includes('rate') || lowerReply.includes('scope'), 'Addresses pricing question');
    assert(!lowerReply.includes('confirm your timezone'), 'Does NOT ask for timezone');

    const validation = validateCustomerResponse({
      reply: output.reply,
      clientMessage: latestMsg,
      history,
      knownRequirements: output.extractedRequirements,
      requiresReply: output.requiresReply,
      intent: classification.intent,
      subject: 'Re: Consultation',
    });

    assert(validation.isValid, 'Validation passes for pricing topic shift');
  }

  // --------------------------------------------------------------------------
  // TEST 15 — Topic Shift: Customer shifts from Scheduling to Tech Capabilities
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 15: Topic Shift (Scheduling to Tech Capabilities) ---');
  {
    const history = [
      { sender: 'client', text: 'Can we schedule a call for Friday?' },
      { sender: 'agent', text: 'Friday works well. What time works best?' }
    ];
    const latestMsg = 'Before we set up a call, do you also build mobile apps in React Native?';

    const classification = await classifyInboundEmail(
      'Re: Mobile App',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'meeting_request' }
    );

    assert(classification.intent !== 'meeting_request', 'Does NOT classify as meeting_request', `Got: ${classification.intent}`);

    const output = validateAndNormalizeModelOutput(
      null,
      undefined,
      COMPANY_CONTEXT,
      latestMsg,
      classification.intent,
      'Re: Mobile App',
      history
    );

    const lowerReply = output.reply.toLowerCase();
    assert(lowerReply.includes('mobile') || lowerReply.includes('app') || lowerReply.includes('react native') || lowerReply.includes('custom software'), 'Addresses mobile/software capability');
    assert(!lowerReply.includes('what time works best'), 'Does NOT repeat scheduling question');
  }

  // --------------------------------------------------------------------------
  // TEST 16 — Short Message Intent Shift in Active Thread
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 16: Short Message Intent Shift (Sales to Support) ---');
  {
    const history = [
      { sender: 'client', text: 'Need a clothing store.' },
      { sender: 'agent', text: 'We can help build your clothing store.' }
    ];
    const latestMsg = 'Actually, our client portal is down and throwing an error.';

    const classification = await classifyInboundEmail(
      'Re: Clothing store',
      latestMsg,
      { hasActiveConversation: true, previousIntent: 'service_inquiry' }
    );

    assert(classification.intent === 'customer_support', 'Detects customer_support shift even in active sales thread', `Got: ${classification.intent}`);
  }

  // --------------------------------------------------------------------------
  // TEST 17 — Validator Rejection: Reject response answering old context instead of current question
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 17: Validator Rejection of Stale Meeting Coordination ---');
  {
    const history = [
      { sender: 'client', text: "Would 6 PM on 29 September work for a short call?" },
      { sender: 'agent', text: "6 PM on 29 September works. Could you please confirm your timezone?" }
    ];
    const latestMsg = "Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?";

    // Faulty reply that ignored the agency question and answered the old meeting context
    const faultyReply = "Thanks for following up. That time works well for us to discuss website for clothing business.\n\nCould you please confirm your timezone so we can coordinate the calendar invite accordingly?\n\nBest regards,\nEvores";

    const validation = validateCustomerResponse({
      reply: faultyReply,
      clientMessage: latestMsg,
      history,
      requiresReply: true,
      intent: 'partnership',
      subject: 'Re: Partnership Discussion',
    });

    assert(!validation.isValid, 'Validator REJECTS response that ignores agency question and continues asking for timezone');
    assert(validation.issues.some(i => i.includes('agencies outside India') || i.includes('timezone')), 'Validator issue correctly identifies agency or timezone problem', `Issues: ${validation.issues.join('; ')}`);
  }

  console.log('\n================================================================');
  console.log(`MULTI-TURN FIXTURE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
