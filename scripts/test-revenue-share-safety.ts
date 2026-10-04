import { validateEditedDraftText } from '../src/lib/services/aiApprovalService';
import { generateDraftsFromCompanyInstruction } from '../src/lib/ai/draftVariationEngine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runRevenueShareSafetyTests() {
  console.log('========================================================================');
  console.log('  TESTING REVENUE SHARE COMMERCIAL SAFETY & GATING RULES                ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function runTest(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`✓ Test ${total} PASSED: ${name}`);
    } catch (err) {
      console.error(`❌ Test ${total} FAILED: ${name}`);
      throw err;
    }
  }

  // 1. "We agree to 30% revenue share."
  runTest('1. "We agree to 30% revenue share." -> Commercial commitment detected', () => {
    const text = 'Hi Hritik,\n\nWe agree to 30% revenue share.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(!val.isValid, 'Expected isValid to be false');
    assert(val.hasUnverifiedCommercialClaim === true, 'Expected hasUnverifiedCommercialClaim to be true');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('revenue share') && i.includes('30%')),
      `Expected issue mentioning 30% revenue share, got: ${JSON.stringify(val.issues)}`
    );
  });

  // 2. "We agree to 30% revenue-share."
  runTest('2. "We agree to 30% revenue-share." -> Commercial commitment detected', () => {
    const text = 'Hi Hritik,\n\nWe agree to 30% revenue-share.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(!val.isValid, 'Expected isValid to be false');
    assert(val.hasUnverifiedCommercialClaim === true, 'Expected hasUnverifiedCommercialClaim to be true');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('revenue share') && i.includes('30%')),
      `Expected issue mentioning 30% revenue share, got: ${JSON.stringify(val.issues)}`
    );
  });

  // 3. "We accept 30% rev share."
  runTest('3. "We accept 30% rev share." -> Commercial commitment detected', () => {
    const text = 'Hi Hritik,\n\nWe accept 30% rev share.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(!val.isValid, 'Expected isValid to be false');
    assert(val.hasUnverifiedCommercialClaim === true, 'Expected hasUnverifiedCommercialClaim to be true');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('revenue share') && i.includes('30%')),
      `Expected issue mentioning 30% revenue share, got: ${JSON.stringify(val.issues)}`
    );
  });

  // 4. "We confirm 30% commission."
  runTest('4. "We confirm 30% commission." -> Existing commission detection still works', () => {
    const text = 'Hi Hritik,\n\nWe confirm 30% commission.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(!val.isValid, 'Expected isValid to be false');
    assert(val.hasUnverifiedCommercialClaim === true, 'Expected hasUnverifiedCommercialClaim to be true');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('commission') && i.includes('30%')),
      `Expected issue mentioning 30% commission, got: ${JSON.stringify(val.issues)}`
    );
  });

  // 5. "We are open to discussing revenue share."
  runTest('5. "We are open to discussing revenue share." -> Not treated as explicit percentage commitment', () => {
    const text = 'Hi Hritik,\n\nWe are open to discussing revenue share and how we can collaborate.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(val.isValid === true, `Expected isValid to be true, got issues: ${JSON.stringify(val.issues)}`);
    assert(val.hasUnverifiedCommercialClaim === false, 'Expected hasUnverifiedCommercialClaim to be false');
    assert(
      !val.issues.some((i) => i.includes('Send blocked: This response appears to commit to')),
      'Should not have unapproved percentage commitment block'
    );
  });

  // 6. "We can discuss a possible revenue-share arrangement."
  runTest('6. "We can discuss a possible revenue-share arrangement." -> Not falsely treated as confirmed percentage commitment', () => {
    const text = 'Hi Hritik,\n\nWe can discuss a possible revenue-share arrangement for our partnership during our kickoff call.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'Hi, can we discuss a referral partnership?');
    assert(val.isValid === true, `Expected isValid to be true, got issues: ${JSON.stringify(val.issues)}`);
    assert(val.hasUnverifiedCommercialClaim === false, 'Expected hasUnverifiedCommercialClaim to be false');
  });

  // 7. "Tell them we agree to 30% revenue share."
  runTest('7. "Tell them we agree to 30% revenue share." -> Draft generated -> Final safety validation detects commercial commitment', () => {
    const drafts = generateDraftsFromCompanyInstruction({
      instruction: 'Tell them we agree to 30% revenue share.',
      customerMessage: "Hi, we're interested in discussing a referral partnership with your company.",
      customerName: 'Hritik',
      companyName: 'Evores',
    });

    console.log(`   Generated Draft Preview:\n   "${drafts.professional.replace(/\n+/g, ' ')}"`);
    const val = validateEditedDraftText(drafts.professional, "Hi, we're interested in discussing a referral partnership.", {
      restrictedTopics: ['commission_revenue_share'],
    });
    assert(!val.isValid, 'Expected generated draft to fail safety validation without explicit authorization');
    assert(val.hasUnverifiedCommercialClaim === true, 'Expected hasUnverifiedCommercialClaim to be true on generated draft');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('revenue share') && i.includes('30%')),
      `Expected issue identifying 30% revenue share in generated draft, got: ${JSON.stringify(val.issues)}`
    );
  });

  // 8. "Tell them we guarantee delivery in 7 days."
  runTest('8. "Tell them we guarantee delivery in 7 days." -> Existing guarantee protection still passes', () => {
    const text = 'Hi Hritik,\n\nWe guarantee delivery in 7 days unconditionally.\n\nBest,\nEvores';
    const val = validateEditedDraftText(text, 'When can you deliver the project?');
    assert(!val.isValid, 'Expected guarantee to fail validation');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('guarantee')),
      `Expected guarantee issue, got: ${JSON.stringify(val.issues)}`
    );
  });

  console.log('\n========================================================================');
  console.log(`  ALL ${passed} / ${total} REVENUE SHARE SAFETY TESTS PASSED!`);
  console.log('========================================================================\n');
}

runRevenueShareSafetyTests().catch((err) => {
  console.error('Fatal error in revenue share safety tests:', err);
  process.exit(1);
});
