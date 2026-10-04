import { classifyDeterministically, classifyInboundEmail, EmailIntent } from '../src/lib/services/email/emailClassifier';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { generateContextualFallback, validateAndNormalizeModelOutput } from '../src/lib/ai/validator';
import { CompanyContext } from '../src/lib/ai/types';

const companyContext: CompanyContext = {
  name: 'Evores',
  industry: 'IT Services',
  services: ['Web Development', 'Custom Software', 'Mobile Apps', 'Automation'],
  description: 'Specializing in high-quality web, mobile, and automation engineering for growing businesses.',
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASSED: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('  TESTING INTENT -> RESPONSE PIPELINE FOR 3 HARD REAL SCENARIOS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SCENARIO 1: GENUINE SERVICE + PRICING INQUIRY
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Pricing Inquiry ---');
  const email1 = {
    messageId: 'test-msg-1',
    sender: 'rahul@clientdomain.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Need help with online business',
    text: "Hi,\n\nI am planning to start an online business and I'm looking for someone who can build the website and help me get it ready for customers.\n\nHow much would something like this normally cost?\n\nI don't have the exact requirements finalized yet.\n\nRegards,\nRahul",
  };

  const classResult1 = classifyDeterministically(email1);
  assert(classResult1 !== null, 'Test 1 deterministically classified');
  assert(classResult1!.classification === 'CUSTOMER_INQUIRY', 'Test 1 is CUSTOMER_INQUIRY');
  assert(classResult1!.intent === 'pricing', 'Test 1 intent is pricing');
  assert(classResult1!.requiresReply === true, 'Test 1 requires reply');

  // Response generation (fallback/engine)
  const response1 = generateContextualFallback(
    companyContext,
    {},
    email1.text,
    undefined,
    classResult1!.intent,
    email1.subject
  );
  console.log('\nGenerated Response 1:\n' + response1.reply + '\n');
  assert(/cost|pricing|price|estimate/i.test(response1.reply), 'Response 1 answers pricing directly');
  assert(!/do you have (the )?website content and project images ready/i.test(response1.reply), 'Response 1 does NOT ask unrelated content/images question');

  // Validation of good response
  const val1Good = validateCustomerResponse({
    reply: response1.reply,
    clientMessage: email1.text,
    history: [],
    intent: classResult1!.intent,
    subject: email1.subject,
  });
  assert(val1Good.isValid === true, 'Response 1 passes validation');

  // Validation of bad response (the observed buggy response from Test 1)
  const badReply1 = "Thanks for reaching out to EvoreS. We can certainly help you build a professional website.\n\nTo understand what you need, could you let us know whether you already have the website content and project images ready, or would you also need help preparing those?";
  const val1Bad = validateCustomerResponse({
    reply: badReply1,
    clientMessage: email1.text,
    history: [],
    intent: classResult1!.intent,
    subject: email1.subject,
  });
  assert(val1Bad.isValid === false, 'Validator correctly REJECTS buggy response that ignored pricing question');
  console.log('  Rejected with issues:', val1Bad.issues);

  // --------------------------------------------------------------------------
  // SCENARIO 2: PARTNERSHIP / REFERRAL PROPOSAL
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Partnership & Referral Proposal ---');
  const email2 = {
    messageId: 'test-msg-2',
    sender: 'amit@marketingco.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Potential partnership',
    text: "Hi FillFlow,\n\nWe run a small digital marketing company and are interested in partnering with you.\n\nWe could potentially refer clients who need automation and technology services to your company, while you could refer suitable clients to us.\n\nWould you be open to discussing a partnership?\n\nRegards,\nAmit",
  };

  const classResult2 = classifyDeterministically(email2);
  assert(classResult2 !== null, 'Test 2 deterministically classified');
  assert(classResult2!.classification === 'CUSTOMER_INQUIRY', 'Test 2 is CUSTOMER_INQUIRY');
  assert(classResult2!.intent === 'partnership', 'Test 2 intent is partnership');
  assert(classResult2!.requiresReply === true, 'Test 2 requires reply');

  // Response generation (fallback/engine)
  const response2 = generateContextualFallback(
    companyContext,
    {},
    email2.text,
    undefined,
    classResult2!.intent,
    email2.subject
  );
  console.log('\nGenerated Response 2:\n' + response2.reply + '\n');
  assert(/partner|partnership|collaboration|referral/i.test(response2.reply), 'Response 2 acknowledges partnership and referral');
  assert(!/how can we assist you with your project today/i.test(response2.reply), 'Response 2 does NOT treat as generic project intake');

  // Validation of good response
  const val2Good = validateCustomerResponse({
    reply: response2.reply,
    clientMessage: email2.text,
    history: [],
    intent: classResult2!.intent,
    subject: email2.subject,
  });
  assert(val2Good.isValid === true, 'Response 2 passes validation');

  // Validation of bad response (the observed buggy response from Test 2)
  const badReply2 = "Thanks for reaching out to EvoreS. How can we assist you with your project today?";
  const val2Bad = validateCustomerResponse({
    reply: badReply2,
    clientMessage: email2.text,
    history: [],
    intent: classResult2!.intent,
    subject: email2.subject,
  });
  assert(val2Bad.isValid === false, 'Validator correctly REJECTS buggy response that treated partnership as generic project intake');
  console.log('  Rejected with issues:', val2Bad.issues);

  // --------------------------------------------------------------------------
  // SCENARIO 3: LEGITIMATE INVESTMENT & STRATEGIC FUNDING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Legitimate Investment & Strategic Funding ---');
  const email3 = {
    messageId: 'test-msg-3',
    sender: 'arjun@investor.com',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Investment discussion',
    text: "Hi,\n\nI came across your company and would like to understand whether you are currently open to investment or strategic funding.\n\nWe would be interested in discussing a possible investment and would like to schedule a short call with the founders.\n\nPlease let me know if this is something you would consider.\n\nRegards,\nArjun",
  };

  const classResult3 = classifyDeterministically(email3);
  assert(classResult3 !== null, 'Test 3 deterministically classified');
  assert(classResult3!.classification === 'CUSTOMER_INQUIRY', 'Test 3 is CUSTOMER_INQUIRY');
  assert(classResult3!.intent === 'investment', 'Test 3 intent is investment');
  assert(classResult3!.requiresReply === true, 'Test 3 requires reply');

  // Response generation (fallback/engine)
  const response3 = generateContextualFallback(
    companyContext,
    {},
    email3.text,
    undefined,
    classResult3!.intent,
    email3.subject
  );
  console.log('\nGenerated Response 3:\n' + response3.reply + '\n');
  assert(/invest|investment|funding|founders/i.test(response3.reply), 'Response 3 acknowledges investment and founder call');
  assert(!/what are your project requirements|assist you with your project/i.test(response3.reply), 'Response 3 does NOT ask for project requirements');

  // Validation of good response
  const val3Good = validateCustomerResponse({
    reply: response3.reply,
    clientMessage: email3.text,
    history: [
      // Simulate prior conversation with agent where an introductory call question was asked
      { sender: 'client', text: 'Hi' },
      { sender: 'agent', text: 'Thanks for reaching out to Evores. Would you be open to scheduling a brief introductory call?' },
    ],
    intent: classResult3!.intent,
    subject: email3.subject,
  });
  assert(val3Good.isValid === true, 'Response 3 passes validation');

  // Validation of bad response (treating investment as project requirements)
  const badReply3 = "Thanks for reaching out to Evores. What are your project requirements and tech stack?";
  const val3Bad = validateCustomerResponse({
    reply: badReply3,
    clientMessage: email3.text,
    history: [],
    intent: classResult3!.intent,
    subject: email3.subject,
  });
  assert(val3Bad.isValid === false, 'Validator correctly REJECTS response asking for project requirements on investment inquiry');
  console.log('  Rejected with issues:', val3Bad.issues);

  // --------------------------------------------------------------------------
  // SCENARIO 4: INVESTMENT SPAM VS LEGITIMATE INVESTMENT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Investment Spam vs Legitimate Investment ---');
  const spamEmail = {
    messageId: 'test-msg-spam',
    sender: 'promo@cryptobtc.org',
    recipient: 'evores.co@gmail.com',
    timestamp: Date.now(),
    subject: 'Guaranteed 40% returns! Click here now to invest in high yield program',
    text: 'Earn $500 daily with our crypto investment scheme! Guaranteed investment returns. Wire funds or send $5000 now.',
  };

  const classSpam = classifyDeterministically(spamEmail);
  assert(classSpam !== null, 'Investment spam is deterministically classified');
  assert(classSpam!.classification === 'SPAM', 'Investment spam classified as SPAM');
  assert(classSpam!.requiresReply === false, 'Investment spam requiresReply is FALSE');

  console.log('\n================================================================');
  console.log('  ALL SCENARIOS PASSED WITH 100% ACCURACY AND 0 GEMINI CALLS!   ');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
