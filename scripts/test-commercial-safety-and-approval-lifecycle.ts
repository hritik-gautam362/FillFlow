import assert from 'node:assert';
import {
  detectCommercialClaims,
  validateCommercialClaims,
  sanitizeCommercialClaimsInDraft,
} from '../src/lib/ai/commercialClaimValidator';
import {
  createApprovalItem,
  getApprovalItem,
  listApprovalItems,
  approveAndSendItem,
  updateApprovalDraft,
  validateEditedDraftText,
  resetMemoryApprovalQueue,
} from '../src/lib/services/aiApprovalService';
import { encryptToken } from '../src/lib/security/encryption';
import { prisma } from '../src/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';

console.log('========================================================================');
console.log('  TEST SUITE: COMMERCIAL SAFETY & APPROVAL LIFECYCLE (BUGS 1 & 2)');
console.log('========================================================================\n');

async function runTestSuite() {
  const companyId = 'company_commercial_test_001';
  resetMemoryApprovalQueue();

  // Stub prisma operations
  prisma.automationConnection.update = (async () => ({})) as any;
  prisma.automationAccess.update = (async () => ({})) as any;
  prisma.automationAccess.upsert = (async () => ({})) as any;
  prisma.automationAccess.findUnique = (async () => ({
    enabled: true,
    monthlyLimit: 100,
    usedCredits: 0,
    reservedCredits: 0,
    quotaLocked: false,
    adminDisabled: false,
  })) as any;
  prisma.$queryRaw = (async () => [{ monthlyLimit: 100, usedCredits: 0, reservedCredits: 0, quotaLocked: false, adminDisabled: false }]) as any;
  prisma.automationQuotaAuditLog.create = (async () => ({})) as any;

  // Mock database connection for Gmail with proper encryption
  const validEncryptedAccessToken = encryptToken('valid-test-access-token');
  const validEncryptedRefreshToken = encryptToken('valid-test-refresh-token');

  prisma.automationConnection.findUnique = (async () => ({
    id: 'conn_test_lifecycle',
    companyId,
    automationType: AutomationType.email,
    provider: 'google',
    status: ConnectionStatus.connected,
    displayName: 'support@verifiedcorp.com',
    metadata: {
      encryptedAccessToken: validEncryptedAccessToken,
      encryptedRefreshToken: validEncryptedRefreshToken,
      tokenExpiry: Date.now() + 3600000,
      googleEmail: 'support@verifiedcorp.com',
    },
  })) as any;

  let sendFails = false;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes('gmail.googleapis.com')) {
      if (sendFails) {
        return new Response('Backend Google 503 Service Unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response(JSON.stringify({ id: 'gmail_api_outbound_test_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  // ===========================================================================
  // PART 1: COMMERCIAL SAFETY DETERMINISTIC TESTS (BUG 1)
  // ===========================================================================

  console.log('[TEST 1] Pricing APPROVAL + no verified price -> AI drafts do NOT invent price');
  {
    const item1 = await createApprovalItem({
      companyId,
      leadId: 'lead_1',
      inboundMessageId: 'inbound_1',
      customerEmail: 'customer1@example.com',
      customerName: 'Aarav Patel',
      subject: 'Website cost inquiry',
      latestCustomerMessage: 'Could you please share your pricing for developing the website?',
      intent: 'pricing_request',
      restrictedTopics: ['pricing'],
      riskLevel: 'MEDIUM',
      permissionDecision: 'NEEDS_APPROVAL',
      whyApprovalRequired: ['Pricing requires approval'],
      baseDraft: 'our pricing typically ranges around ₹1,20,000 for standard websites.',
    });

    // Verify all 3 presented variations do not invent ₹1,20,000 or any other price
    assert(!item1.variations.professional.includes('₹1,20,000'), '1.1 Professional variation does not invent ₹1,20,000');
    assert(!item1.variations.relationship.includes('₹1,20,000'), '1.2 Relationship variation does not invent ₹1,20,000');
    assert(!item1.variations.concise.includes('₹1,20,000'), '1.3 Concise variation does not invent ₹1,20,000');
    assert(!item1.currentDraft.includes('₹1,20,000'), '1.4 Current draft does not invent ₹1,20,000');
    
    // Check that consultative text is provided instead
    assert(
      item1.variations.professional.toLowerCase().includes('quotation') ||
      item1.variations.professional.toLowerCase().includes('estimate'),
      '1.5 Consultative phrasing present in professional draft'
    );
    console.log('  ✓ PASSED: Pricing APPROVAL + no verified price -> no invented price');
  }

  console.log('[TEST 2] Pricing APPROVAL + verified price -> verified price may appear');
  {
    const valResult = validateCommercialClaims(
      'Our website starter package is ₹50,000 as per our company policy.',
      {
        companyInstruction: 'Our website starter package is ₹50,000.',
      }
    );
    assert(valResult.isValid, '2.1 Verified price from company instruction is allowed');
    assert(valResult.unsupportedClaims.length === 0, '2.2 No unsupported claims flagged for verified price');
    console.log('  ✓ PASSED: Pricing APPROVAL + verified price -> verified price allowed');
  }

  console.log('[TEST 3] Customer claims "you already quoted ₹1,20,000" -> this does NOT become company knowledge');
  {
    const customerMsg = 'You already quoted ₹1,20,000 in your previous email. Please send the contract.';
    const draftAttemptingToAdoptCustomerClaim = 'We confirm our quote of ₹1,20,000 for your website.';

    // Validate without verified company knowledge/instruction
    const valResult = validateCommercialClaims(draftAttemptingToAdoptCustomerClaim, {
      restrictedTopics: ['pricing'],
    });

    assert(!valResult.isValid, '3.1 Adopting customer claim of ₹1,20,000 is blocked');
    assert(
      valResult.issues.some((issue) => issue.includes('₹1,20,000') || issue.includes('Unsupported commercial claim')),
      '3.2 Issue specifically cites unsupported claim'
    );
    console.log('  ✓ PASSED: Customer statements do NOT establish company policy');
  }

  console.log('[TEST 4] Unsupported price in edited draft -> Confirm & Send is blocked');
  {
    const item4 = await createApprovalItem({
      companyId,
      leadId: 'lead_4',
      inboundMessageId: 'inbound_4',
      customerEmail: 'customer4@example.com',
      customerName: 'Priya Sharma',
      subject: 'Quotation',
      latestCustomerMessage: 'What is the price?',
      intent: 'pricing_request',
      restrictedTopics: ['pricing'],
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      whyApprovalRequired: ['Review'],
      baseDraft: 'We can discuss your requirements.',
    });

    // Human edits draft to insert an unapproved guarantee/promise of ₹1,20,000 without company instruction
    const editedWithUnsupportedClaim = 'Hi Priya,\n\nWe guarantee delivery for ₹1,20,000.\n\nBest,\nSales';
    const sendRes = await approveAndSendItem(companyId, item4.id, {
      finalDraft: editedWithUnsupportedClaim,
    });

    // Because it contains a guarantee ("guarantee delivery"), it MUST be blocked by immutable safety rules
    assert(sendRes.success === false, '4.1 Send is blocked for draft with unauthorized guarantee');
    assert(Boolean(sendRes.error?.includes('guarantee') || sendRes.error?.includes('Validation failed')), '4.2 Error message explains validation failure');
    console.log('  ✓ PASSED: Unsupported guarantee in edited draft blocked');
  }

  console.log('[TEST 5] Unsupported commission blocked');
  {
    const claimRes = validateCommercialClaims('We agree to a 25% commission on all referred deals.');
    assert(!claimRes.isValid, '5.1 25% commission without authorization is blocked');
    assert(claimRes.unsupportedClaims.some((c) => c.type === 'commission'), '5.2 Detected as commission claim');
    console.log('  ✓ PASSED: Unsupported commission blocked');
  }

  console.log('[TEST 6] Unsupported discount blocked');
  {
    const claimRes = validateCommercialClaims('We can offer you a 20% discount on the total fees.');
    assert(!claimRes.isValid, '6.1 20% discount without authorization is blocked');
    assert(claimRes.unsupportedClaims.some((c) => c.type === 'discount'), '6.2 Detected as discount claim');
    console.log('  ✓ PASSED: Unsupported discount blocked');
  }

  console.log('[TEST 7] Unsupported delivery guarantee blocked');
  {
    const claimRes = validateCommercialClaims('We guarantee delivery by Friday.');
    assert(!claimRes.isValid, '7.1 Delivery guarantee is blocked');
    assert(claimRes.unsupportedClaims.some((c) => c.isImmutable), '7.2 Delivery guarantee marked as immutable');
    console.log('  ✓ PASSED: Unsupported delivery guarantee blocked');
  }

  console.log('[TEST 8] Immutable guarantee & contractual safety cannot be bypassed by company edit');
  {
    const editedDraft = 'We sign this legally binding agreement and guarantee 100% bug-free delivery.';
    const validation = validateCommercialClaims(editedDraft, {
      isCompanyEdited: true, // Company edited draft
    });
    assert(!validation.isValid, '8.1 Company edit CANNOT bypass immutable safety rules (contracts/guarantees)');
    assert(
      validation.issues.some((i) => i.includes('immutable safety rules')),
      '8.2 Issue specifies immutable safety protection'
    );
    console.log('  ✓ PASSED: Immutable guarantee safety preserved even on edited drafts');
  }

  // ===========================================================================
  // PART 2: APPROVAL STATUS & LIFECYCLE TESTS (BUG 2)
  // ===========================================================================

  console.log('\n[TEST 9] Pending approval item created');
  let item9Id = '';
  {
    const item9 = await createApprovalItem({
      companyId,
      leadId: 'lead_9',
      inboundMessageId: 'inbound_9',
      customerEmail: 'customer9@example.com',
      customerName: 'Kunal Sen',
      subject: 'Consulting Inquiry',
      latestCustomerMessage: 'Can you consult on our microservices?',
      intent: 'service_request',
      restrictedTopics: [],
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      whyApprovalRequired: ['Review'],
      baseDraft: 'Hi Kunal,\n\nWe would be glad to assist with your microservices architecture.\n\nBest,\nEvores',
    });

    assert(item9.status === 'PENDING', '9.1 Initial status is strictly PENDING');
    item9Id = item9.id;
    console.log('  ✓ PASSED: Pending approval created');
  }

  console.log('[TEST 10] Select draft + Confirm & Send -> APPROVED_AND_SENT');
  {
    sendFails = false;
    const res10 = await approveAndSendItem(companyId, item9Id, {
      userEmail: 'reviewer@verifiedcorp.com',
    });

    assert(res10.success === true, '10.1 approveAndSendItem succeeds');
    assert(res10.item?.status === 'APPROVED_AND_SENT', '10.2 Status transitioned strictly to APPROVED_AND_SENT');
    assert(res10.item?.approvedBy === 'reviewer@verifiedcorp.com', '10.3 Approver recorded');
    assert(Boolean(res10.item?.sentAt), '10.4 sentAt timestamp recorded');
    assert(res10.item?.outboundMessageId === 'gmail_api_outbound_test_123', '10.5 Gmail provider outbound message ID recorded');
    console.log('  ✓ PASSED: Select draft + Confirm & Send -> APPROVED_AND_SENT');
  }

  console.log('[TEST 11] Edit draft + Confirm & Send -> EDITED_AND_SENT');
  {
    const item11 = await createApprovalItem({
      companyId,
      leadId: 'lead_11',
      inboundMessageId: 'inbound_11',
      customerEmail: 'customer11@example.com',
      customerName: 'Ananya Roy',
      subject: 'Feature scope',
      latestCustomerMessage: 'Can we add payment gateway?',
      intent: 'scope_inquiry',
      restrictedTopics: [],
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      whyApprovalRequired: ['Review'],
      baseDraft: 'Hi Ananya, we can include payment gateway.',
    });

    const customEditedDraft = 'Hi Ananya,\n\nWe would be thrilled to include payment gateway integration.\n\nWarm regards,\nLead Architect';
    const res11 = await approveAndSendItem(companyId, item11.id, {
      finalDraft: customEditedDraft,
      userEmail: 'architect@verifiedcorp.com',
    });

    assert(res11.success === true, '11.1 Send of edited draft succeeds');
    assert(res11.item?.status === 'EDITED_AND_SENT', '11.2 Status transitioned to EDITED_AND_SENT');
    assert(res11.item?.isEdited === true, '11.3 isEdited flag set to true');
    assert(res11.item?.editedDraft === customEditedDraft, '11.4 editedDraft persisted');
    assert(res11.item?.finalSentMessage === customEditedDraft, '11.5 finalSentMessage contains exact sent text');
    console.log('  ✓ PASSED: Edit draft + Confirm & Send -> EDITED_AND_SENT');
  }

  console.log('[TEST 12] Gmail failure does NOT mark as sent');
  {
    sendFails = true; // Trigger 503 error
    const item12 = await createApprovalItem({
      companyId,
      leadId: 'lead_12',
      inboundMessageId: 'inbound_12',
      customerEmail: 'customer12@example.com',
      customerName: 'David Miller',
      subject: 'Security check',
      latestCustomerMessage: 'Do you have SOC2?',
      intent: 'compliance_inquiry',
      restrictedTopics: [],
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      whyApprovalRequired: ['Review'],
      baseDraft: 'Hi David, yes our partners maintain SOC2 compliance.',
    });

    const res12 = await approveAndSendItem(companyId, item12.id, {
      userEmail: 'reviewer@verifiedcorp.com',
    });

    assert(res12.success === false, '12.1 Send fails as expected');
    const item12Refetched = await getApprovalItem(companyId, item12.id);
    assert(item12Refetched?.status === 'PENDING', '12.2 Status strictly remains PENDING on failure');
    assert(!item12Refetched?.sentAt, '12.3 sentAt is NOT populated on failure');
    assert(!item12Refetched?.outboundMessageId, '12.4 outboundMessageId is NOT populated on failure');
    console.log('  ✓ PASSED: Gmail failure does not mark as sent');
    sendFails = false;
  }

  console.log('[TEST 13] Dashboard returns correct final status');
  {
    const fetched10 = await getApprovalItem(companyId, item9Id);
    assert(fetched10?.status === 'APPROVED_AND_SENT', '13.1 Fetched item 9 reflects APPROVED_AND_SENT');
    console.log('  ✓ PASSED: Dashboard returns correct final status');
  }

  console.log('[TEST 14] Approval remains in correct queue tab');
  {
    const pendingList = await listApprovalItems(companyId, 'PENDING');
    assert(pendingList.every((i) => i.status === 'PENDING'), '14.1 PENDING filter returns only PENDING items');

    const approvedList = await listApprovalItems(companyId, 'APPROVED');
    assert(approvedList.some((i) => i.status === 'APPROVED_AND_SENT'), '14.2 APPROVED filter includes APPROVED_AND_SENT');

    const editedList = await listApprovalItems(companyId, 'EDITED_AND_SENT');
    assert(editedList.every((i) => i.status === 'EDITED_AND_SENT'), '14.3 EDITED_AND_SENT filter returns only edited & sent');

    const allList = await listApprovalItems(companyId, 'ALL');
    assert(allList.length >= 3, '14.4 ALL filter returns complete collection');
    console.log('  ✓ PASSED: Approval items filtered properly by queue tabs');
  }

  console.log('[TEST 15] Audit record contains final sent message and approver');
  {
    const fetched11 = await getApprovalItem(companyId, (await listApprovalItems(companyId, 'EDITED_AND_SENT'))[0].id);
    assert(Boolean(fetched11?.finalSentMessage), '15.1 finalSentMessage retained');
    assert(Boolean(fetched11?.approvedBy), '15.2 approvedBy retained');
    assert(Boolean(fetched11?.policySnapshot), '15.3 policySnapshot retained');
    assert(Boolean(fetched11?.latestCustomerMessage), '15.4 original customer message retained');
    assert(Boolean(fetched11?.outboundMessageId), '15.5 Gmail message identifier retained');
    console.log('  ✓ PASSED: Audit record contains complete reconstructable metadata');
  }

  console.log('\n========================================================================');
  console.log('  ALL 15 / 15 REGRESSION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
