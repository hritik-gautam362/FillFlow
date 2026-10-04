import { generateContextualFallback, validateAndNormalizeModelOutput } from '../src/lib/ai/validator';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { ExtractedRequirements } from '../src/lib/ai/types';

const companyContext = {
  name: 'EvoreS',
  industry: 'IT Services',
  services: ['Custom Software', 'Web Development'],
  description: 'We provide full stack software development.',
  pricingPolicy: 'Milestone based pricing.',
};

console.log('--- Testing 3-Turn Gmail Scenario ---');

// TURN 1:
const turn1Text = 'I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?';
const turn1Output = generateContextualFallback(companyContext, {}, turn1Text, undefined, 'project_request', 'busi', []);
console.log('\n[TURN 1 OUTPUT]');
console.log('Reply:\n' + turn1Output.reply);
console.log('Requirements:', JSON.stringify(turn1Output.extractedRequirements, null, 2));

const history: Array<{ sender: 'client' | 'agent'; text: string }> = [
  { sender: 'client', text: turn1Text },
  { sender: 'agent', text: turn1Output.reply },
];

// TURN 2:
const turn2Text = 'I also need online payments and around 50 products. Would that change the estimate?';
const turn2Output = generateContextualFallback(companyContext, turn1Output.extractedRequirements, turn2Text, undefined, 'follow_up', 'Re: busi', history);
console.log('\n[TURN 2 OUTPUT]');
console.log('Reply:\n' + turn2Output.reply);
console.log('Requirements:', JSON.stringify(turn2Output.extractedRequirements, null, 2));

history.push({ sender: 'client', text: turn2Text });
history.push({ sender: 'agent', text: turn2Output.reply });

// Cumulative requirements merge as done in pipeline:
const cumReq: Partial<ExtractedRequirements> = {
  ...turn1Output.extractedRequirements,
  ...turn2Output.extractedRequirements,
  features: Array.from(new Set([
    ...(turn1Output.extractedRequirements.features || []),
    ...(turn2Output.extractedRequirements.features || []),
  ])),
};

// TURN 3:
const turn3Text = `I would prefer using [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] for the payment integration. For the checkout flow, I am looking for a simple [Standard / Guest / Multi-step] checkout process.

Please let me know how this impacts the overall estimate and scope for our December launch.`;

const turn3Output = generateContextualFallback(companyContext, cumReq, turn3Text, undefined, 'follow_up', 'Re: busi', history);
console.log('\n[TURN 3 OUTPUT]');
console.log('Reply:\n' + turn3Output.reply);
console.log('Next Question:', turn3Output.nextBestQuestion);
console.log('Client Question Answered:', turn3Output.clientQuestionAnswered);
console.log('Requirements:', JSON.stringify(turn3Output.extractedRequirements, null, 2));

const turn3Val = validateCustomerResponse({
  reply: turn3Output.reply,
  clientMessage: turn3Text,
  history,
  knownRequirements: turn3Output.extractedRequirements,
  requiresReply: true,
  intent: 'follow_up',
  subject: 'Re: busi',
});
console.log('Validation:', turn3Val);
