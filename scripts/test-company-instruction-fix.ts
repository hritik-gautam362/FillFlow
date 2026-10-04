/**
 * Deterministic Test Suite for Company Instruction -> Customer Reply Fix
 *
 * Verifies all 8 required test scenarios from the specification:
 * TEST 1: "generate a msg tell them we're interested in the partnership" -> No "generate a msg"
 * TEST 2: "write an email saying we're interested and ask about their referral process" -> Asks about referral process naturally
 * TEST 3: "tell them we're okay with 30% revenue share" -> Communicates intended revenue-share position naturally
 * TEST 4: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you"
 *         -> Communicates equity proposal naturally; NO "generate a msg", NO "tell we are going to", or meta language
 * TEST 5: Professional/Warm/Concise all preserve intended meaning with distinct styles
 * TEST 6: Customer asks about partnership + company instruction about partnership -> No unrelated project-intake response
 * TEST 7: Company instruction contains an unauthorized commercial commitment -> Existing safety/permission system determines whether Safe, Approval Required, or Blocked
 * TEST 8: Unauthorized equity/financial commitment must NOT incorrectly appear as "Safe to Send" if existing permission requires approval
 */

import { generateDraftsFromCompanyInstruction, stripMetaInstructionWrappers, sanitizeCustomerFacingDraft } from '../src/lib/ai/draftVariationEngine';
import { evaluatePermissionAndRisk } from '../src/lib/ai/permissionEngine';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { validateEditedDraftText } from '../src/lib/services/aiApprovalService';
import { CompanyPermissionConfig } from '../src/lib/ai/permissionTypes';

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ✓ PASSED: ${message}`);
}

const FORBIDDEN_META_WORDS = [
  'generate a msg',
  'generate a message',
  'write an email',
  'write a message',
  'tell them',
  'tell we',
  'ask them to',
  'create a response',
  'the company wants to say',
  'according to your instruction',
  'the instruction states',
  'you asked us to say',
];

function assertNoMetaLanguage(text: string, label: string) {
  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_META_WORDS) {
    assert(!lower.includes(forbidden), `${label} does NOT contain meta language: "${forbidden}"`);
  }
}

async function runTests() {
  console.log('\n========================================================================');
  console.log('  STARTING TEST SUITE: COMPANY INSTRUCTION FIX (TESTS 1 - 8)');
  console.log('========================================================================\n');

  const customerMessage = "We're interested in discussing a partnership with your company.";
  const customerName = 'Hritik';
  const companyName = 'Evores';

  // --------------------------------------------------------------------------
  // TEST 1: "generate a msg tell them we're interested in the partnership"
  // Expected: Generated email does NOT contain "generate a msg".
  // --------------------------------------------------------------------------
  console.log('[TEST 1] "generate a msg tell them we\'re interested in the partnership"');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "generate a msg tell them we're interested in the partnership",
      customerName,
      companyName,
    });

    assert(Boolean(drafts.professional), 'Professional draft generated');
    assert(Boolean(drafts.warm), 'Warm draft generated');
    assert(Boolean(drafts.concise), 'Concise draft generated');

    assertNoMetaLanguage(drafts.professional, 'TEST 1 Professional draft');
    assertNoMetaLanguage(drafts.warm, 'TEST 1 Warm draft');
    assertNoMetaLanguage(drafts.concise, 'TEST 1 Concise draft');

    assert(
      drafts.professional.toLowerCase().includes('interested') &&
      drafts.professional.toLowerCase().includes('partnership'),
      'Professional draft communicates interest in partnership'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 2: "write an email saying we're interested and ask about their referral process"
  // Expected: Generated email asks about the referral process naturally.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] "write an email saying we\'re interested and ask about their referral process"');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "write an email saying we're interested and ask about their referral process",
      customerName,
      companyName,
    });

    assertNoMetaLanguage(drafts.professional, 'TEST 2 Professional draft');
    assertNoMetaLanguage(drafts.warm, 'TEST 2 Warm draft');
    assertNoMetaLanguage(drafts.concise, 'TEST 2 Concise draft');

    assert(
      drafts.professional.toLowerCase().includes('referral process') ||
      drafts.professional.toLowerCase().includes('referral'),
      'Professional draft naturally asks about referral process'
    );
    assert(
      drafts.warm.toLowerCase().includes('referral'),
      'Warm draft naturally asks about referral process'
    );
    assert(
      drafts.concise.toLowerCase().includes('referral'),
      'Concise draft directly mentions referral process'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 3: "tell them we're okay with 30% revenue share"
  // Expected: Generated email communicates the intended revenue-share position naturally.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] "tell them we\'re okay with 30% revenue share"');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "tell them we're okay with 30% revenue share",
      customerName,
      companyName,
    });

    assertNoMetaLanguage(drafts.professional, 'TEST 3 Professional draft');
    assertNoMetaLanguage(drafts.warm, 'TEST 3 Warm draft');
    assertNoMetaLanguage(drafts.concise, 'TEST 3 Concise draft');

    assert(
      drafts.professional.includes('30%') &&
      (drafts.professional.toLowerCase().includes('revenue-share') || drafts.professional.toLowerCase().includes('revenue share')),
      'Professional draft communicates 30% revenue share naturally'
    );
    assert(
      drafts.warm.includes('30%'),
      'Warm draft communicates 30% revenue share naturally'
    );
    assert(
      drafts.concise.includes('30%'),
      'Concise draft communicates 30% revenue share naturally'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 4: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you"
  // Expected: Generated email communicates equity proposal naturally.
  // It must NOT contain "generate a msg", "tell we are going to", or other meta-generation language.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you"');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      customerName,
      companyName,
    });

    console.log('\n  [Generated Professional Draft]:');
    console.log('  ' + drafts.professional.replace(/\n/g, '\n  '));
    console.log('\n  [Generated Warm Draft]:');
    console.log('  ' + drafts.warm.replace(/\n/g, '\n  '));
    console.log('\n  [Generated Concise Draft]:');
    console.log('  ' + drafts.concise.replace(/\n/g, '\n  '));

    // Check meta language absence
    assertNoMetaLanguage(drafts.professional, 'TEST 4 Professional draft');
    assertNoMetaLanguage(drafts.warm, 'TEST 4 Warm draft');
    assertNoMetaLanguage(drafts.concise, 'TEST 4 Concise draft');

    assert(!drafts.professional.toLowerCase().includes('tell we are going to'), 'Does not contain "tell we are going to"');
    assert(!drafts.professional.toLowerCase().includes('regarding your inquiry, generate'), 'Does not contain broken "regarding your inquiry, generate" prefix');

    // Check equity communication
    assert(
      drafts.professional.includes('40%') && drafts.professional.toLowerCase().includes('equity'),
      'Professional draft communicates 40% equity proposal'
    );
    assert(
      drafts.warm.includes('40%') && drafts.warm.toLowerCase().includes('equity'),
      'Warm draft communicates 40% equity proposal'
    );
    assert(
      drafts.concise.includes('40%') && drafts.concise.toLowerCase().includes('equity'),
      'Concise draft communicates 40% equity proposal'
    );

    // Check salutation and signoff
    assert(drafts.professional.startsWith('Hi Hritik,'), 'Professional draft uses correct salutation "Hi Hritik,"');
    assert(drafts.professional.includes('Best regards,\nEvores'), 'Professional draft uses proper company sign-off');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Professional/Warm/Concise all preserve intended meaning with distinct styles
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Style differentiation while preserving intended meaning');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      customerName,
      companyName,
    });

    assert(drafts.professional !== drafts.warm, 'Professional and Warm drafts have distinct wording');
    assert(drafts.professional !== drafts.concise, 'Professional and Concise drafts have distinct wording');
    assert(drafts.warm !== drafts.concise, 'Warm and Concise drafts have distinct wording');

    assert(drafts.concise.length < drafts.professional.length, 'Concise draft is shorter than Professional');
    assert(drafts.warm.toLowerCase().includes('warm regards'), 'Warm draft uses relationship-focused sign-off');
    assert(drafts.professional.toLowerCase().includes('best regards'), 'Professional draft uses formal sign-off');

    // All three still communicate the 40% equity proposal
    assert(drafts.professional.includes('40%'), 'Professional preserves 40% equity');
    assert(drafts.warm.includes('40%'), 'Warm preserves 40% equity');
    assert(drafts.concise.includes('40%'), 'Concise preserves 40% equity');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Customer asks about partnership + company instruction about partnership
  // Expected: No unrelated project-intake response.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Partnership inquiry + partnership instruction -> No unrelated project-intake');
  {
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      customerName,
      companyName,
    });

    const intakePatterns = [
      /\bwhat are you looking to achieve\b/i,
      /\bhow can we assist you with your project today\b/i,
      /\bwhat is your budget\b/i,
      /\bwhat features do you need\b/i,
      /\bwhat kind of website or app\b/i,
      /\btech stack\b/i,
    ];

    for (const pattern of intakePatterns) {
      assert(!pattern.test(drafts.professional), `Professional draft does not contain generic intake pattern: ${pattern}`);
      assert(!pattern.test(drafts.warm), `Warm draft does not contain generic intake pattern: ${pattern}`);
      assert(!pattern.test(drafts.concise), `Concise draft does not contain generic intake pattern: ${pattern}`);
    }

    const valResult = validateCustomerResponse({
      reply: drafts.professional,
      clientMessage: customerMessage,
    });
    assert(!valResult.isGeneric, 'Response is not flagged as generic boilerplate');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Company instruction contains an unauthorized commercial commitment
  // Expected: Existing safety/permission system determines whether Safe, Approval Required, or Blocked.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Commercial commitment permission evaluation (Safe vs Approval Required vs Blocked)');
  {
    // A. Default configuration (requires approval for commercial terms) -> NEEDS_APPROVAL ("Approval Required")
    const resDefault = evaluatePermissionAndRisk({
      messageText: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
    });
    assert(resDefault.decision === 'NEEDS_APPROVAL', 'Default config evaluates commercial equity commitment to NEEDS_APPROVAL');
    assert(resDefault.riskLevel === 'HIGH', 'Commercial equity risk level is HIGH');
    assert(resDefault.requiresCompanyApproval === true, 'Requires company approval is true');
    assert(
      resDefault.restrictedTopics.includes('commercial_equity') || resDefault.restrictedTopics.includes('equity_commitment'),
      'Restricted topics include equity commitment'
    );

    // B. Explicit BLOCKED policy -> BLOCKED
    const resBlocked = evaluatePermissionAndRisk({
      messageText: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      config: {
        topicPolicies: {
          customCommercialTerms: 'BLOCKED',
          revenueShare: 'BLOCKED',
        } as any,
      },
    });
    assert(resBlocked.decision === 'BLOCKED', 'Blocked policy configuration evaluates to BLOCKED');
    assert(resBlocked.requiresCompanyApproval === true, 'Blocked decision requires company escalation');

    // C. Explicit AUTO policy -> SAFE_AUTO_REPLY ("Safe")
    const resAuto = evaluatePermissionAndRisk({
      messageText: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      config: {
        autonomyMode: 'LIMITED_ACCESS',
        topicPolicies: {
          customCommercialTerms: 'AUTO',
          revenueShare: 'AUTO',
          pricing: 'AUTO',
          discounts: 'AUTO',
          commission: 'AUTO',
          refunds: 'AUTO',
          paymentTerms: 'AUTO',
          deliveryTimelines: 'AUTO',
          deadlines: 'AUTO',
          slas: 'AUTO',
          clientCommunication: 'AUTO',
        } as any,
      },
    });
    assert(resAuto.decision === 'SAFE_AUTO_REPLY', 'Permissive auto policy evaluates to SAFE_AUTO_REPLY');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Unauthorized equity/financial commitment must NOT incorrectly appear as "Safe to Send"
  // if the existing permission configuration requires approval.
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Unauthorized equity commitment must NOT appear as "Safe to Send"');
  {
    const defaultSafetyConfig: CompanyPermissionConfig = {
      autoReplyGeneralInfo: true,
      autoReplyServices: true,
      autoReplyPartnerships: false,
      autoReplyPricing: false,
      autoReplyDiscounts: false,
      autoReplyCommission: false,
      autoReplyContracts: false,
      autoReplyRefunds: false,
      autoReplyDeadlines: false,
      autoReplySLAs: false,
    };

    // 1. Permission engine check
    const evalResult = evaluatePermissionAndRisk({
      messageText: "we need 40 percent equity from you",
      config: defaultSafetyConfig,
    });

    assert(evalResult.decision !== 'SAFE_AUTO_REPLY', 'Decision is NOT SAFE_AUTO_REPLY');
    assert(evalResult.decision === 'NEEDS_APPROVAL', 'Decision is correctly NEEDS_APPROVAL');
    assert(evalResult.requiresCompanyApproval === true, 'Company approval is required');

    // 2. Draft validation check for unauthorized commercial commitment
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage,
      instruction: "generate a msg tell we are going to do the partnership, but we need 40 percent equity from you.",
      customerName,
      companyName,
    });

    const validation = validateEditedDraftText(drafts.professional, customerMessage, {
      restrictedTopics: ['commercial_equity', 'equity_commitment'],
    });

    // Verification that status indicates approval is required, NOT safe
    assert(validation.status !== 'SAFE', 'Draft status is NOT SAFE');
    assert(validation.status === 'APPROVAL_REQUIRED', 'Draft validation status is APPROVAL_REQUIRED');
    assert(validation.requiresApproval === true, 'Draft validation correctly indicates approval is required');
  }

  console.log(`\n========================================================================`);
  console.log(`  ALL REQUIRED SPECIFICATION TESTS PASSED: ${passed} / ${total} SUCCESSFUL`);
  console.log(`========================================================================\n`);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
