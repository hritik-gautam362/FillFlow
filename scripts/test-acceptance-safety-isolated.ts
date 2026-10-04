import { generateDraftsFromCompanyInstruction } from '../src/lib/ai/draftVariationEngine';
import { validateEditedDraftText } from '../src/lib/services/aiApprovalService';

function run() {
  console.log('Testing Acceptance Safety Test 4 isolated:');
  const drafts4A = generateDraftsFromCompanyInstruction({
    instruction: 'Tell them we agree to 30% revenue share.',
    customerMessage: "Hi, we're interested in discussing a referral partnership with your company.",
    customerName: 'Hritik',
    companyName: 'Evores',
  });

  const val4A = validateEditedDraftText(drafts4A.professional, "Hi, we're interested in discussing a referral partnership.", {
    restrictedTopics: ['commission_revenue_share'],
  });

  console.log('[Test 4A Result]:', {
    isValid: val4A.isValid,
    issues: val4A.issues,
    hasUnverifiedCommercialClaim: val4A.hasUnverifiedCommercialClaim,
  });

  const commercialIdentified = val4A.issues.some((i) => i.toLowerCase().includes('commission') || i.toLowerCase().includes('revenue'));
  console.log('commercialIdentified:', commercialIdentified);

  const guaranteeDraft = 'Hi Hritik,\n\nWe guarantee delivery within 7 days unconditionally.\n\nBest,\nEvores';
  const val4B = validateEditedDraftText(guaranteeDraft, 'When can you deliver?', {
    restrictedTopics: ['delivery_deadline_guarantee'],
  });

  console.log('[Test 4B Result]:', {
    isValid: val4B.isValid,
    issues: val4B.issues,
  });

  const guaranteeBlocked = !val4B.isValid && val4B.issues.some((i) => i.toLowerCase().includes('guarantee') || i.toLowerCase().includes('delivery'));
  console.log('guaranteeBlocked:', guaranteeBlocked);

  if (commercialIdentified && guaranteeBlocked && !val4A.isValid) {
    console.log('✓ ACCEPTANCE SAFETY TEST 4 PASSED CLEANLY!');
  } else {
    console.error('❌ Failed');
    process.exit(1);
  }
}

run();
