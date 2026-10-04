/**
 * Dedicated Regression Test Suite for CURRENT-TURN PRIORITY & STALE-TOPIC ELIMINATION
 *
 * Verifies all 8 required tests from the specification:
 * - TEST 1: Budget change (₹3 lakh -> ₹80,000)
 * - TEST 2: Contact ownership change (Agency -> Evores direct)
 * - TEST 3: Unsupported commission (15% cannot be confirmed without configured policy)
 * - TEST 4: Stale UX/full-stack context elimination
 * - TEST 5: Multiple questions compound handling
 * - TEST 6: Previous AI statement non-authoritative
 * - TEST 7: Explicit correction ("Actually, I meant ₹80,000, not ₹3 lakh")
 * - TEST 8: Topic continuation (preserving necessary context without overcorrecting)
 */

import { buildStructuredConversationContext } from '../src/lib/ai/conversationMemory';
import { formatConversationPrompt, getSystemInstruction } from '../src/lib/ai/prompts';
import { validateAndNormalizeModelOutput, generateContextualFallback, parseModelJson } from '../src/lib/ai/validator';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { CompanyContext } from '../src/lib/ai/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAILED: ${description}`);
    throw new Error(description);
  }
}

const mockCompanyContext: CompanyContext = {
  name: 'Evores',
  industry: 'Software Development & Consulting',
  services: ['Full-Stack Web Development', 'Mobile Apps', 'Cloud Infrastructure'],
  description: 'Evores is a modern software engineering partner.',
};

async function runCurrentTurnPriorityTests() {
  console.log('========================================================================');
  console.log('  CURRENT-TURN PRIORITY & STALE CONTEXT ELIMINATION REGRESSION SUITE   ');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Budget Change (Old: ₹3 lakh -> New: ₹80,000)
  // --------------------------------------------------------------------------
  console.log('[TEST 1] Budget change: ₹3 lakh -> ₹80,000');
  {
    const history = [
      { sender: 'client' as const, text: 'We have a web development client with a budget of ₹3 lakh.' },
      { sender: 'agent' as const, text: 'Thanks for sharing. We would be glad to discuss the scope for this ₹3 lakh project.' },
    ];
    const latestMessage = 'Also, our budget for the first referred project has changed from ₹3 lakh to ₹80,000.';
    const prevRequirements = { budget: '₹3 lakh', projectType: 'Web Development' };

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage,
      previousRequirements: prevRequirements,
      companyContext: mockCompanyContext,
    });

    assert(structuredContext.facts.budget === '₹80,000', 'New budget ₹80,000 overrides old ₹3 lakh');
    const budgetReq = structuredContext.currentTurnRequirements.find(r => r.type === 'budget_change');
    assert(Boolean(budgetReq), 'Budget change requirement detected');
    assert(budgetReq?.currentValue === '₹80,000', 'Current value captured as ₹80,000');
    assert(budgetReq?.previousValue?.includes('3 lakh') === true, 'Previous value captured as ₹3 lakh');

    const prompt = formatConversationPrompt(history, latestMessage, prevRequirements, mockCompanyContext);
    assert(prompt.includes('BUDGET CORRECTION') || prompt.includes('CHANGES / CORRECTIONS'), 'Prompt elevates budget correction');
    assert(prompt.includes('₹80,000'), 'Prompt contains ₹80,000');

    const normalized = validateAndNormalizeModelOutput(
      null,
      prevRequirements,
      mockCompanyContext,
      latestMessage,
      'partnership',
      'Partnership Update',
      history
    );
    assert(normalized.extractedRequirements.budget === '₹80,000', 'Normalized requirements budget is ₹80,000');
    assert(normalized.reply.includes('₹80,000'), 'Fallback reply explicitly addresses ₹80,000');
    assert(!normalized.reply.includes('UX design'), 'Fallback does not mention UX design');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Contact Ownership Change (Agency primary -> Evores direct)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Contact ownership change: Agency primary -> Evores communicates directly');
  {
    const history = [
      { sender: 'client' as const, text: 'Our agency will be the primary point of contact for all client interactions.' },
      { sender: 'agent' as const, text: 'Understood, we will coordinate everything through your agency.' },
    ];
    const latestMessage = 'Actually, I want to correct something from earlier. Our agency does NOT want to remain the primary point of contact. We want Evores to communicate directly with the client after the introduction.';

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage,
      previousRequirements: {},
      companyContext: mockCompanyContext,
    });

    const commReq = structuredContext.currentTurnRequirements.find(r => r.type === 'communication_preference');
    assert(Boolean(commReq), 'Communication preference change captured');
    assert(commReq?.requestedValue?.toLowerCase().includes('directly') === true, 'Direct communication preference recognized');

    const fallback = generateContextualFallback(mockCompanyContext, {}, latestMessage, undefined, 'partnership', undefined, history);
    assert(/communicat\w*\s+directly|direct\s+client\s+communication|directly\s+with\s+the\s+client/i.test(fallback.reply), 'Response acknowledges direct communication preference');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Unsupported Commission (15% cannot be confirmed without policy)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Unsupported commercial policy: "Can you guarantee 15% commission?"');
  {
    const customerMsg = 'Can you guarantee 15% commission on all referred projects?';
    const structuredContext = buildStructuredConversationContext({
      history: [],
      latestMessage: customerMsg,
      companyContext: mockCompanyContext,
    });

    const commPolicyReq = structuredContext.currentTurnRequirements.find(r => r.type === 'commercial_policy');
    assert(Boolean(commPolicyReq), 'Commercial policy inquiry detected');
    assert(commPolicyReq?.status === 'unverified', '15% commission marked as unverified');

    // Validator check: Unconditional confirmation of 15% without leadership qualification MUST be rejected
    const badReply = 'Hi,\n\nYes, we can confirm that the 15% commission is acceptable and guaranteed for all your referred projects.\n\nBest regards,\nEvores';
    const badValidation = validateCustomerResponse({
      reply: badReply,
      clientMessage: customerMsg,
      history: [],
      companyContext: mockCompanyContext,
    });
    assert(!badValidation.isValid, 'Unconditional confirmation of unverified 15% commission is REJECTED');
    assert(badValidation.hasUnverifiedCommercialClaim === true, 'hasUnverifiedCommercialClaim flag is raised');

    // Good reply qualifying with leadership confirmation MUST pass
    const goodReply = 'Hi,\n\nThanks for reaching out to Evores. Regarding the 15% commission structure, specific commercial agreements and referral percentages require confirmation with our leadership team before they can be finalized. Could you share details about the expected project volume?\n\nBest regards,\nEvores';
    const goodValidation = validateCustomerResponse({
      reply: goodReply,
      clientMessage: customerMsg,
      history: [],
      companyContext: mockCompanyContext,
    });
    assert(goodValidation.isValid, 'Qualified reply stating leadership confirmation is ACCEPTED');
    assert(!goodValidation.hasUnverifiedCommercialClaim, 'hasUnverifiedCommercialClaim is false for qualified response');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Stale UX / Full-stack Context Elimination
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Stale UX / full-stack context elimination');
  {
    const history = [
      { sender: 'client' as const, text: 'We do UX design and need full-stack development partners.' },
      { sender: 'agent' as const, text: 'That sounds like a great collaboration with your UX team and our development team.' },
    ];
    const latestMessage = 'Can you confirm that the 15% commission, direct client communication, and the ₹80,000 budget are all acceptable?';

    // The buggy response from the real production failure
    const buggyProductionReply = `Hi,

Thanks for following up with Evores. That mutual referral partnership sounds like a great collaboration, especially with your team focusing on UX design and ours on full-stack development.

Could you share what typical project size or tech stack your clients most frequently require?

Best regards, Evores`;

    const validation = validateCustomerResponse({
      reply: buggyProductionReply,
      clientMessage: latestMessage,
      history,
      companyContext: mockCompanyContext,
    });

    assert(!validation.isValid, 'Buggy production response is REJECTED');
    assert(validation.hasStaleTopic === true, 'hasStaleTopic flag is raised');
    assert(validation.issues.some(i => i.toLowerCase().includes('ux design')), 'Flagged for resurrecting UX design');
    assert(validation.issues.some(i => i.toLowerCase().includes('full-stack')), 'Flagged for resurrecting full-stack development');
    assert(validation.issues.some(i => i.toLowerCase().includes('typical project size or tech stack') || i.toLowerCase().includes('discovery question')), 'Flagged for asking stale project size/tech stack question');

    // Generated contextual fallback must NOT contain stale topics
    const fallback = generateContextualFallback(
      mockCompanyContext,
      { budget: '₹3 lakh' },
      latestMessage,
      undefined,
      'partnership',
      'Partnership',
      history
    );
    assert(!fallback.reply.toLowerCase().includes('ux design'), 'Contextual fallback does NOT contain UX design');
    assert(!fallback.reply.toLowerCase().includes('full-stack'), 'Contextual fallback does NOT contain full-stack development');
    assert(!fallback.reply.toLowerCase().includes('typical project size'), 'Contextual fallback does NOT ask typical project size');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Multiple Questions Compound Handling
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Multiple questions: Customer asks 3 explicit items in 1 message');
  {
    const latestMessage = `Actually, I want to correct something from earlier. Our agency does NOT want to remain the primary point of contact. We want Evores to communicate directly with the client after the introduction.

Also, our budget for the first referred project has changed from ₹3 lakh to ₹80,000.

Can you confirm that the 15% commission, direct client communication, and the ₹80,000 budget are all acceptable?`;

    const structuredContext = buildStructuredConversationContext({
      history: [
        { sender: 'client', text: 'We have a ₹3 lakh project.' },
        { sender: 'agent', text: 'Understood.' },
      ],
      latestMessage,
      companyContext: mockCompanyContext,
    });

    // Check all 3 requirements captured
    const hasBudgetChange = structuredContext.currentTurnRequirements.some(r => r.type === 'budget_change' && r.currentValue === '₹80,000');
    const hasCommPref = structuredContext.currentTurnRequirements.some(r => r.type === 'communication_preference');
    const hasPolicy = structuredContext.currentTurnRequirements.some(r => r.type === 'commercial_policy');
    assert(hasBudgetChange, 'Captured budget change to ₹80,000');
    assert(hasCommPref, 'Captured communication preference change');
    assert(hasPolicy, 'Captured commission policy question');

    // Validation checks for partial answers
    const partialReply = 'Hi,\n\nWe note the budget change to ₹80,000. Best regards,\nEvores';
    const partialVal = validateCustomerResponse({
      reply: partialReply,
      clientMessage: latestMessage,
      history: [],
      companyContext: mockCompanyContext,
    });
    assert(!partialVal.isValid, 'Partial reply ignoring communication preference is REJECTED');

    // Full fallback addressing all 3
    const fullFallback = generateContextualFallback(mockCompanyContext, { budget: '₹3 lakh' }, latestMessage, undefined, 'partnership', undefined, []);
    assert(fullFallback.reply.includes('₹80,000'), 'Addresses ₹80,000 budget');
    assert(/communicat\w*\s+directly|direct\s+client\s+communication/i.test(fullFallback.reply), 'Addresses direct client communication');
    assert(/commission|commercial/i.test(fullFallback.reply), 'Addresses 15% commission structure');
    assert(/leadership|management|confirm/i.test(fullFallback.reply), 'Qualifies commission with leadership confirmation');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Previous AI Hallucination Never Authoritative
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Previous AI statement is NOT authoritative company policy');
  {
    const history = [
      { sender: 'client' as const, text: 'What is your standard agency referral structure?' },
      { sender: 'agent' as const, text: 'We offer a 20% commission on all referred projects!' }, // Hallucination by older AI
    ];
    const latestMessage = 'Can you confirm the 20% commission in the formal contract?';

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage,
      companyContext: mockCompanyContext, // Has no 20% commission configured
    });

    const commPolicy = structuredContext.currentTurnRequirements.find(r => r.type === 'commercial_policy');
    assert(Boolean(commPolicy), 'Commercial policy requirement extracted');
    assert(commPolicy?.status === 'unverified', 'Customer request for 20% remains UNVERIFIED despite previous agent text');

    const prompt = formatConversationPrompt(history, latestMessage, {}, mockCompanyContext);
    assert(prompt.includes('NEVER AUTHORITATIVE'), 'Prompt explicitly labels previous agent replies as non-authoritative');
    assert(prompt.includes('Never treat an earlier AI-generated statement as verified company policy'), 'Prompt forbids adopting AI hallucination');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Explicit Customer Correction
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Explicit correction: "Actually, I meant ₹80,000, not ₹3 lakh"');
  {
    const history = [
      { sender: 'client' as const, text: 'Our budget is ₹3 lakh.' },
      { sender: 'agent' as const, text: 'Noted, ₹3 lakh budget.' },
    ];
    const latestMessage = 'Actually, I meant ₹80,000, not ₹3 lakh.';

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage,
      previousRequirements: { budget: '₹3 lakh' },
      companyContext: mockCompanyContext,
    });

    assert(structuredContext.facts.budget === '₹80,000', 'Corrected ₹80,000 becomes truth in memory');
    const budgetReq = structuredContext.currentTurnRequirements.find(r => r.type === 'budget_change');
    assert(Boolean(budgetReq), 'Budget correction detected');
    assert(budgetReq?.currentValue === '₹80,000', 'Current value is ₹80,000');
    assert(budgetReq?.previousValue?.includes('3 lakh') === true, 'Previous value captured as ₹3 lakh');

    const normalized = validateAndNormalizeModelOutput(
      { reply: 'Noted the budget of ₹80,000.' },
      { budget: '₹3 lakh' },
      mockCompanyContext,
      latestMessage,
      'project_request',
      undefined,
      history
    );
    assert(normalized.extractedRequirements.budget === '₹80,000', 'Normalized requirements adopt corrected budget');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Topic Continuation (Preserves Necessary Context Without Overcorrecting)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Topic continuation: Preserving relevant context without overcorrecting');
  {
    const history = [
      { sender: 'client' as const, text: 'We need an e-commerce website for our clothing brand with an ₹80,000 budget.' },
      { sender: 'agent' as const, text: 'Thanks for reaching out. We can deliver a responsive e-commerce catalog for your clothing brand within ₹80,000.' },
    ];
    const latestMessage = 'Does that include payment gateway integration?';

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage,
      previousRequirements: { projectType: 'e-commerce website', businessType: 'clothing brand', budget: '₹80,000' },
      companyContext: mockCompanyContext,
    });

    // Previous facts must NOT be wiped out
    assert(/clothing/i.test(structuredContext.facts.businessType || ''), 'Preserves business type (clothing)');
    assert(structuredContext.facts.budget === '₹80,000', 'Preserves budget (₹80,000)');

    const prompt = formatConversationPrompt(
      history,
      latestMessage,
      { projectType: 'e-commerce website', businessType: 'clothing brand', budget: '₹80,000' },
      mockCompanyContext
    );
    assert(prompt.includes('clothing brand'), 'Prompt retains relevant business domain');
    assert(prompt.includes('₹80,000'), 'Prompt retains relevant budget');
    assert(prompt.includes('Does that include payment gateway integration?'), 'Prompt highlights current question');
  }

  // --------------------------------------------------------------------------
  // TEST 9: Robust JSON Parser Under Trailing Comma & Truncation
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Robust JSON parser resilience');
  {
    const jsonWithTrailingCommas = `{
      "reply": "We have noted your revised ₹80,000 budget.",
      "conversationState": "ANSWER_AND_ASK_ONE_QUESTION",
      "extractedRequirements": {
        "budget": "₹80,000",
        "features": ["direct client communication",],
      },
    }`;

    const parsed = parseModelJson(jsonWithTrailingCommas);
    assert(parsed !== null, 'Successfully parses JSON with trailing commas');
    assert(parsed?.reply === 'We have noted your revised ₹80,000 budget.', 'Extracts correct reply');

    // Flawed JSON with broken object structure after reply
    const flawedJson = `{"reply": "Acknowledged direct client communication and ₹80,000 budget.", "conversationState": "ANSWER_AND_ASK_ONE_QUESTION", extractedRequirements: { broken `;
    const parsedFlawed = parseModelJson(flawedJson);
    assert(parsedFlawed !== null, 'Regex recovery rescues reply from syntax-flawed JSON');
    assert(parsedFlawed?.reply?.toString().includes('₹80,000') === true, 'Extracted reply from broken JSON');
  }

  console.log('\n========================================================================');
  console.log(`  CURRENT-TURN REGRESSION SUITE: ${passed} PASSED, ${failed} FAILED     `);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCurrentTurnPriorityTests().catch((err) => {
  console.error('Fatal error in regression test suite:', err);
  process.exit(1);
});
