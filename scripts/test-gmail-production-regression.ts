import { classifyDeterministically, classifyInboundEmail, EmailIntent } from '../src/lib/services/email/emailClassifier';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { generateContextualFallback, validateAndNormalizeModelOutput } from '../src/lib/ai/validator';
import { CompanyContext } from '../src/lib/ai/types';

const companyContext: CompanyContext = {
  name: 'Evores',
  industry: 'IT Services',
  services: ['Web Development', 'Custom Software', 'Mobile Apps', 'Automation'],
  description: 'Specializing in high-quality web, mobile, and automation engineering for growing businesses.',
  pricingPolicy: 'Custom quoting based on project scope, timeline, and feature complexity.',
};

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passedCount++;
  console.log(`  ✓ PASSED: ${message}`);
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('  REGRESSION TEST SUITE: 12 GMAIL PRODUCTION INQUIRY SCENARIOS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SCENARIO 1: Brand-new website inquiry with budget
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 1: Brand-new website inquiry with budget ---');
  const email1 = {
    messageId: 'gmail-msg-001',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Website for clothing business',
    text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?',
  };

  const class1 = await classifyInboundEmail(email1, {
    companyContext,
    threadContext: {
      hasActiveConversation: false,
      isSameThread: false,
      isExistingCustomer: false,
      companyContext,
    },
  });

  assert(class1.classification === 'CUSTOMER_INQUIRY', 'Scenario 1 is CUSTOMER_INQUIRY');
  assert(
    class1.intent === 'project_request' || class1.intent === 'service_inquiry' || class1.intent === 'pricing' || class1.intent === 'pricing_request',
    'Scenario 1 intent is new customer/project/pricing inquiry (NOT follow_up)'
  );

  const response1 = generateContextualFallback(
    companyContext,
    {},
    email1.text,
    undefined,
    class1.intent,
    email1.subject,
    []
  );

  console.log('Generated Response 1:\n' + response1.reply + '\n');
  assert(!/thanks for following up/i.test(response1.reply), 'Response 1 does NOT say "Thanks for following up"');
  assert(!/additional details/i.test(response1.reply), 'Response 1 does NOT say "additional details"');
  assert(/clothing|website/i.test(response1.reply), 'Response 1 acknowledges clothing business / website');
  assert(/20[,.]?000|budget/i.test(response1.reply), 'Response 1 acknowledges ₹20,000 budget');
  assert(/december/i.test(response1.reply), 'Response 1 acknowledges December timeline target');
  assert(/can provide|can include|offer|scope|catalog|pages|core/i.test(response1.reply), 'Response 1 answers what can be provided');

  const val1 = validateCustomerResponse({
    reply: response1.reply,
    clientMessage: email1.text,
    history: [],
    intent: class1.intent,
    subject: email1.subject,
  });
  assert(val1.isValid === true, 'Response 1 passes customer response validation');

  // Verify that the buggy response is explicitly rejected by the validator
  const buggyResponse = "Hi,\n\nThanks for following up. We have noted these additional details for your professional website.\n\nCould you let us know if there are any other specific requirements you would like us to factor in?\n\nBest regards, EvoreS";
  const buggyVal = validateCustomerResponse({
    reply: buggyResponse,
    clientMessage: email1.text,
    history: [],
    intent: class1.intent,
    subject: email1.subject,
  });
  assert(buggyVal.isValid === false, 'Validator explicitly REJECTS buggy "following up" response on new inquiry');
  console.log('  Buggy response issues caught:', buggyVal.issues);

  // --------------------------------------------------------------------------
  // SCENARIO 2: Brand-new service inquiry
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Brand-new service inquiry ---');
  const email2 = {
    messageId: 'gmail-msg-002',
    sender: 'sara@fashionlabel.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Mobile app development inquiry',
    text: 'Hi FillFlow, do you offer mobile app development services for an Android store?',
  };

  const class2 = await classifyInboundEmail(email2, { companyContext });
  assert(class2.classification === 'CUSTOMER_INQUIRY', 'Scenario 2 is CUSTOMER_INQUIRY');
  assert(class2.intent === 'service_inquiry', 'Scenario 2 intent is service_inquiry');
  assert(class2.intent !== 'follow_up', 'Scenario 2 is NOT follow_up');

  const response2 = generateContextualFallback(companyContext, {}, email2.text, undefined, class2.intent, email2.subject, []);
  assert(/mobile app|android/i.test(response2.reply), 'Response 2 directly answers mobile app inquiry');
  assert(!/thanks for following up/i.test(response2.reply), 'Response 2 does NOT say "Thanks for following up"');

  // --------------------------------------------------------------------------
  // SCENARIO 3: Brand-new pricing question
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Brand-new pricing question ---');
  const email3 = {
    messageId: 'gmail-msg-003',
    sender: 'vikram@retailstore.in',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'E-commerce website cost',
    text: 'Hello, how much do you charge for building an e-commerce website?',
  };

  const class3 = await classifyInboundEmail(email3, { companyContext });
  assert(class3.classification === 'CUSTOMER_INQUIRY', 'Scenario 3 is CUSTOMER_INQUIRY');
  assert(class3.intent === 'pricing' || class3.intent === 'pricing_request', 'Scenario 3 intent is pricing');
  assert(class3.intent !== 'follow_up', 'Scenario 3 is NOT follow_up');

  const response3 = generateContextualFallback(companyContext, {}, email3.text, undefined, class3.intent, email3.subject, []);
  assert(/pricing|cost|quote|scope|factors/i.test(response3.reply), 'Response 3 addresses pricing directly');

  // --------------------------------------------------------------------------
  // SCENARIO 4: Existing lead receiving a genuinely NEW inquiry
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: Existing lead receiving a genuinely NEW inquiry ---');
  const email4 = {
    messageId: 'gmail-msg-004',
    sender: 'hritikgautam362@gmail.com', // Existing lead in DB
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'New Project: Inventory Portal',
    text: 'Hi FillFlow, starting a new project. I need an internal inventory management portal. What would the timeline and cost be?',
  };

  const class4 = await classifyInboundEmail(email4, {
    companyContext,
    threadContext: {
      hasActiveConversation: false,
      isSameThread: false, // New email thread!
      isExistingCustomer: true, // Sender existed in DB
      companyContext,
    },
  });

  assert(class4.classification === 'CUSTOMER_INQUIRY', 'Scenario 4 is CUSTOMER_INQUIRY');
  assert(class4.intent !== 'follow_up', 'Scenario 4 is NOT follow_up (Explicit: Existing Lead != automatic FOLLOW_UP)');
  assert(class4.intent === 'pricing' || class4.intent === 'pricing_request' || class4.intent === 'service_inquiry', 'Scenario 4 intent reflects current message');

  const response4 = generateContextualFallback(
    companyContext,
    {},
    email4.text,
    undefined,
    class4.intent,
    email4.subject,
    [] // Fresh thread history
  );
  assert(!/thanks for following up/i.test(response4.reply), 'Response 4 does NOT say "Thanks for following up"');
  assert(/inventory/i.test(response4.reply), 'Response 4 addresses inventory portal, not old topics');

  // --------------------------------------------------------------------------
  // SCENARIO 5: Existing lead with a real follow-up
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: Existing lead with a real follow-up ---');
  const email5 = {
    messageId: 'gmail-msg-005',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-001',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'Actually, I also need online payments and around 50 products. Would that change the estimate?',
  };

  const class5 = await classifyInboundEmail(email5, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      conversationTopic: 'clothing business website',
      previousIntent: 'pricing',
      companyContext,
    },
  });

  assert(class5.classification === 'CUSTOMER_INQUIRY', 'Scenario 5 is CUSTOMER_INQUIRY');
  assert(class5.intent === 'follow_up' || class5.intent === 'pricing' || class5.intent === 'pricing_request', 'Scenario 5 recognized as follow_up / estimate refinement');

  const response5 = generateContextualFallback(
    companyContext,
    { projectType: 'clothing business website', budget: '₹20,000', timeline: 'December' },
    email5.text,
    undefined,
    class5.intent,
    email5.subject,
    [
      { sender: 'client', text: email1.text },
      { sender: 'agent', text: response1.reply },
    ]
  );
  assert(/estimate|online payments|products|scope/i.test(response5.reply), 'Response 5 addresses the additional features & estimate impact');

  // --------------------------------------------------------------------------
  // SCENARIO 6: Existing lead with meeting request
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Existing lead with meeting request ---');
  const email6 = {
    messageId: 'gmail-msg-006',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-005',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'Would 6 PM on 29 September work for a call?',
  };

  const class6 = await classifyInboundEmail(email6, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      conversationTopic: 'clothing business website',
      companyContext,
    },
  });

  assert(class6.classification === 'CUSTOMER_INQUIRY', 'Scenario 6 is CUSTOMER_INQUIRY');
  assert(class6.intent === 'meeting_request', 'Scenario 6 intent is meeting_request');

  const response6 = generateContextualFallback(
    companyContext,
    { projectType: 'clothing business website' },
    email6.text,
    undefined,
    class6.intent,
    email6.subject,
    [{ sender: 'client', text: email5.text }]
  );
  assert(/call|meet|schedule|time|calendar|6 PM|September/i.test(response6.reply), 'Response 6 acknowledges meeting request');

  // --------------------------------------------------------------------------
  // SCENARIO 7: New inquiry from sender who previously contacted company
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: New inquiry from sender who previously contacted company ---');
  const email7 = {
    messageId: 'gmail-msg-007',
    sender: 'pastclient@example.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Mobile app consulting',
    text: 'Hello team, do you also build iOS mobile apps?',
  };

  const class7 = await classifyInboundEmail(email7, {
    companyContext,
    threadContext: {
      hasActiveConversation: false,
      isSameThread: false,
      isExistingCustomer: true, // Known sender in system
      companyContext,
    },
  });

  assert(class7.classification === 'CUSTOMER_INQUIRY', 'Scenario 7 is CUSTOMER_INQUIRY');
  assert(class7.intent === 'service_inquiry' || class7.intent === 'project_request', 'Scenario 7 intent is service/project inquiry (NOT follow_up)');
  assert(class7.intent !== 'follow_up', 'Scenario 7 is NOT follow_up');

  // --------------------------------------------------------------------------
  // SCENARIO 8: New inquiry with subject similar to an old thread
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: New inquiry with subject similar to an old thread ---');
  const email8 = {
    messageId: 'gmail-msg-008',
    sender: 'newuser@example.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Website for clothing business - Brand B',
    text: 'Hi FillFlow, I am launching a new fashion line and need a website built from scratch. How do we get started?',
  };

  const class8 = await classifyInboundEmail(email8, {
    companyContext,
    threadContext: {
      hasActiveConversation: false,
      isSameThread: false,
      isExistingCustomer: false,
      companyContext,
    },
  });

  assert(class8.classification === 'CUSTOMER_INQUIRY', 'Scenario 8 is CUSTOMER_INQUIRY');
  assert(class8.intent !== 'follow_up', 'Scenario 8 is NOT follow_up (Explicit: Existing Thread != automatic FOLLOW_UP)');

  // --------------------------------------------------------------------------
  // SCENARIO 9: Follow-up after website inquiry
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: Follow-up after website inquiry ---');
  const email9 = {
    messageId: 'gmail-msg-009',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-005',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'I would also like customer login and order tracking. Can you include those?',
  };

  const class9 = await classifyInboundEmail(email9, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      conversationTopic: 'clothing business website',
      companyContext,
    },
  });

  assert(class9.classification === 'CUSTOMER_INQUIRY', 'Scenario 9 is CUSTOMER_INQUIRY');
  assert(class9.intent === 'follow_up', 'Scenario 9 recognized as follow_up');

  const response9 = generateContextualFallback(
    companyContext,
    { projectType: 'clothing business website', features: ['online payments', '50 products'] },
    email9.text,
    undefined,
    class9.intent,
    email9.subject,
    [{ sender: 'client', text: email5.text }]
  );
  assert(/login|order tracking|features|accommodate|include/i.test(response9.reply), 'Response 9 addresses login and tracking');

  // --------------------------------------------------------------------------
  // SCENARIO 10: Follow-up adding requirements
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 10: Follow-up adding requirements ---');
  const email10 = {
    messageId: 'gmail-msg-010',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-009',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'Please also ensure we support multiple currency checkout (USD and INR).',
  };

  const class10 = await classifyInboundEmail(email10, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      companyContext,
    },
  });

  assert(class10.classification === 'CUSTOMER_INQUIRY', 'Scenario 10 is CUSTOMER_INQUIRY');
  assert(class10.intent === 'follow_up', 'Scenario 10 is follow_up');

  // --------------------------------------------------------------------------
  // SCENARIO 11: Follow-up asking pricing
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 11: Follow-up asking pricing ---');
  const email11 = {
    messageId: 'gmail-msg-011',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-010',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'How much extra would the multi-currency payment integration cost?',
  };

  const class11 = await classifyInboundEmail(email11, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      companyContext,
    },
  });

  assert(class11.classification === 'CUSTOMER_INQUIRY', 'Scenario 11 is CUSTOMER_INQUIRY');
  assert(class11.intent === 'pricing' || class11.intent === 'pricing_request' || class11.intent === 'follow_up', 'Scenario 11 intent is pricing / follow_up');

  // --------------------------------------------------------------------------
  // SCENARIO 12: Follow-up proposing meeting
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 12: Follow-up proposing meeting ---');
  const email12 = {
    messageId: 'gmail-msg-012',
    sender: 'hritikgautam362@gmail.com',
    recipient: 'evores.co@gmail.com',
    inReplyTo: 'gmail-msg-011',
    timestamp: Date.now(),
    subject: 'Re: Website for clothing business',
    text: 'Can we schedule a 15-minute Google Meet tomorrow at 4 PM to finalize?',
  };

  const class12 = await classifyInboundEmail(email12, {
    companyContext,
    threadContext: {
      hasActiveConversation: true,
      isSameThread: true,
      isExistingCustomer: true,
      companyContext,
    },
  });

  assert(class12.classification === 'CUSTOMER_INQUIRY', 'Scenario 12 is CUSTOMER_INQUIRY');
  assert(class12.intent === 'meeting_request', 'Scenario 12 intent is meeting_request');

  console.log('\n================================================================');
  console.log(`  ALL 12 SCENARIOS PASSED: ${passedCount}/${totalCount} assertions verified.`);
  console.log('================================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
