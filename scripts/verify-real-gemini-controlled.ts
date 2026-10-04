import 'dotenv/config';
import { callGeminiRequirementAgent } from '../src/lib/ai/gemini';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { CompanyContext, ExtractedRequirements } from '../src/lib/ai/types';

const companyContext: CompanyContext = {
  name: 'Evore',
  industry: 'IT Services',
  services: [
    'Web Application Development',
    'Mobile Apps',
    'Custom Software Solutions',
    'Cloud Integrations'
  ],
  description: 'Evore provides bespoke IT Services solutions.',
  pricingPolicy: 'Pricing depends on project scope and deliverables.'
};

async function runControlledVerification() {
  console.log('============================================================');
  console.log('CONTROLLED LIVE GEMINI API VERIFICATION');
  console.log('EXACT REGRESSION TEST: Turn 3 with bracketed placeholders');
  console.log('============================================================');

  let realCalls = 0;

  const history = [
    {
      sender: 'client' as const,
      text: 'I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?'
    },
    {
      sender: 'agent' as const,
      text: 'Hi,\n\nThanks for reaching out to Evore. With a budget of ₹20,000 and targeting launch by December, we can discuss a focused clothing business website covering the core essentials—such as a responsive mobile-friendly design, key product catalog pages, and contact/inquiry functionality.\n\nCould you let us know what specific key features or priorities you would like us to factor in for the initial build?\n\nBest regards,\nEvore'
    },
    {
      sender: 'client' as const,
      text: 'I also need online payments and around 50 products. Would that change the estimate?'
    },
    {
      sender: 'agent' as const,
      text: 'Hi,\n\nThanks for following up. Yes, incorporating online payments and catalog management for around 50 products increases the technical scope compared with a basic setup, which can affect the estimate. With your initial ₹20,000 starting budget, we would want to review the specific product workflows and payment integration to keep your launch on target for December.\n\nDo you have a preferred payment provider or specific checkout flow in mind?\n\nBest regards,\nEvore'
    }
  ];

  const previousRequirements: Partial<ExtractedRequirements> = {
    businessType: 'clothing business',
    projectType: 'website for clothing business',
    budget: '₹20,000',
    timeline: 'December',
    productCount: 'around 50 products',
    features: ['online payments', 'around 50 products']
  };

  const latestMessage = `I would prefer using [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] for the payment integration. For the checkout flow, I am looking for a simple [Standard / Guest / Multi-step] checkout process.\n\nPlease let me know how this impacts the overall estimate and scope for our December launch.`;

  console.log('\nInvoking live Gemini Requirement Agent (Controlled Single Call)...');
  realCalls++;
  const result = await callGeminiRequirementAgent({
    history,
    latestMessage,
    previousRequirements,
    companyContext,
    intent: 'project_request',
    subject: 'Re: Website for clothing business',
    sender: 'customer@example.com'
  });

  console.log('\n--- MODEL OUTPUT ---');
  console.log('Reply:\n' + result.reply);
  console.log('\nExtracted Requirements:\n', JSON.stringify(result.extractedRequirements, null, 2));
  console.log('\nUsed Fallback:', result.usedFallback);
  if (result.usedFallback) console.log('Fallback Reason:', result.fallbackReason);

  // Validate response using responseValidator
  const validation = validateCustomerResponse({
    reply: result.reply,
    clientMessage: latestMessage,
    history,
    knownRequirements: {
      ...previousRequirements,
      ...result.extractedRequirements
    },
    requiresReply: true,
    intent: 'project_request',
    subject: 'Re: Website for clothing business'
  });

  console.log('\n--- VALIDATION RESULTS ---');
  console.log('Is Valid:', validation.isValid);
  if (validation.issues.length > 0) {
    console.error('Validation Issues:', validation.issues);
  }

  // Strict checks
  const lowerReply = result.reply.toLowerCase();
  const checks = [
    {
      name: 'No Generic IT Services Reset',
      pass: !lowerReply.includes('we provide it services solutions') && !lowerReply.includes('could you share a bit more detail about your project')
    },
    {
      name: 'Preserves Budget Context',
      pass: lowerReply.includes('20,000') || result.extractedRequirements.budget?.includes('20,000')
    },
    {
      name: 'Preserves December Launch Context',
      pass: lowerReply.includes('december') || result.extractedRequirements.timeline?.toLowerCase().includes('december')
    },
    {
      name: 'Answers Estimate/Scope Impact First',
      pass: lowerReply.includes('scope') || lowerReply.includes('estimate') || lowerReply.includes('impact') || lowerReply.includes('timeline')
    },
    {
      name: 'No Gateway Fabrication (Did not claim Razorpay/Paytm/Stripe was selected)',
      pass: !/since you (?:chose|selected|prefer|opted for) (?:razorpay|paytm|stripe)/i.test(result.reply)
    },
    {
      name: 'No Checkout Flow Fabrication (Did not claim Standard/Guest/Multi-step was selected)',
      pass: !/since you (?:chose|selected|prefer|opted for) (?:standard|guest|multi-step)/i.test(result.reply)
    }
  ];

  console.log('\n--- STRICT CRITERIA CHECK ---');
  let allPassed = true;
  for (const c of checks) {
    console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
    if (!c.pass) allPassed = false;
  }

  console.log('\n============================================================');
  console.log(`REAL GEMINI API CALLS = ${realCalls}`);
  console.log('============================================================\n');

  if (!allPassed || !validation.isValid) {
    console.error('❌ Controlled real Gemini call failed strict criteria.');
    process.exit(1);
  } else {
    console.log('🎉 Controlled live Gemini verification PASSED flawlessly!');
  }
}

runControlledVerification().catch((err) => {
  console.error('Controlled verification error:', err);
  process.exit(1);
});
