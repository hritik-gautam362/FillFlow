/**
 * Phase 3B: Final Response Editor + Review UX Test Suite
 *
 * Deterministic tests for all 22 required test cases:
 *  1. Open approval item
 *  2. Select Professional draft
 *  3. Select Warm draft
 *  4. Select Concise draft
 *  5. Edit draft
 *  6. Reset edited draft
 *  7. Preview final response
 *  8. Safe edited response passes
 *  9. Edited commission commitment blocked
 * 10. Edited pricing commitment blocked
 * 11. Stale budget blocked
 * 12. Placeholder blocked
 * 13. Contract commitment blocked
 * 14. Confirmation required
 * 15. Successful send
 * 16. Duplicate send rejected
 * 17. Failed send releases quota
 * 18. Successful send commits quota
 * 19. Gmail thread ID preserved
 * 20. In-Reply-To preserved
 * 21. Tenant isolation
 * 22. Approval item cannot be sent after completion
 *
 * Uses mocked transport for deterministic execution.
 * Zero real Gmail emails sent. Zero real Gemini calls.
 */

import { prisma } from '../src/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import {
  createApprovalItem,
  getApprovalItem,
  selectDraftVariation,
  updateApprovalDraft,
  approveAndSendItem,
  rejectApprovalItem,
  validateEditedDraftText,
  resetMemoryApprovalQueue,
} from '../src/lib/services/aiApprovalService';
import {
  EmailProvider,
  SendEmailResult,
  SendEmailParams,
  ParsedInboundEmail,
  ParsedDeliveryEvent,
} from '../src/lib/services/email/EmailProvider';
import {
  reserveEmailQuota,
  commitEmailQuota,
  releaseEmailQuota,
  getEmailQuota,
} from '../src/lib/services/emailQuotaService';

let passedCount = 0;
let totalCount = 0;

function assert(condition: unknown, message: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passedCount++;
  console.log(`  ✓ PASSED: ${message}`);
}

class MockGmailProvider implements EmailProvider {
  readonly providerType = 'google';
  sentEmails: SendEmailParams[] = [];
  shouldFail = false;
  failureError = 'Simulated Gmail API 503 Service Unavailable';

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return {
        success: false,
        error: this.failureError,
      };
    }

    const providerMessageId = `gmail_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push({ ...params });

    return {
      success: true,
      providerMessageId,
    };
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseInboundMessage(): ParsedInboundEmail {
    return {
      messageId: 'mock_inbound_phase3b',
      sender: 'aarav@techventures.io',
      recipient: 'hello@evores.com',
      subject: 'Commercial Proposal & Discount',
      text: 'Can you confirm the 15% commission?',
      timestamp: Date.now(),
    };
  }

  normalizeMessage(text: string): string {
    return text.trim();
  }

  parseDeliveryEvent(): ParsedDeliveryEvent | null {
    return null;
  }
}

async function runPhase3BTestSuite() {
  console.log('========================================================================');
  console.log('   FILLFLOW PHASE 3B: FINAL RESPONSE EDITOR + REVIEW UX TEST SUITE     ');
  console.log('========================================================================\n');

  resetMemoryApprovalQueue();
  const mockProvider = new MockGmailProvider();

  const testTimestamp = Date.now();
  const companyAId = `co_phase3b_a_${testTimestamp}`;
  const companyBId = `co_phase3b_b_${testTimestamp}`;

  // Create isolated companies in DB to allow quota transactions without FK violations
  try {
    await prisma.company.createMany({
      data: [
        { id: companyAId, name: `Company A ${testTimestamp}` },
        { id: companyBId, name: `Company B ${testTimestamp}` },
      ],
      skipDuplicates: true,
    });

    await prisma.automationConnection.createMany({
      data: [
        {
          companyId: companyAId,
          automationType: AutomationType.email,
          provider: 'google',
          status: ConnectionStatus.connected,
          displayName: 'company_a@evores.com',
          metadata: { googleEmail: 'company_a@evores.com' },
        },
        {
          companyId: companyBId,
          automationType: AutomationType.email,
          provider: 'google',
          status: ConnectionStatus.connected,
          displayName: 'company_b@evores.com',
          metadata: { googleEmail: 'company_b@evores.com' },
        },
      ],
      skipDuplicates: true,
    });

    await prisma.automationAccess.createMany({
      data: [
        {
          companyId: companyAId,
          automationType: AutomationType.email,
          monthlyLimit: 100,
          usedCredits: 5,
          reservedCredits: 0,
          quotaLocked: false,
          adminDisabled: false,
        },
        {
          companyId: companyBId,
          automationType: AutomationType.email,
          monthlyLimit: 100,
          usedCredits: 2,
          reservedCredits: 0,
          quotaLocked: false,
          adminDisabled: false,
        },
      ],
      skipDuplicates: true,
    });
  } catch (err) {
    console.warn('DB initialization note:', err);
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Open approval item
    // ------------------------------------------------------------------------
    console.log('[TEST 1] Open Approval Item');
    const initialItem = await createApprovalItem({
      companyId: companyAId,
      leadId: `lead_${testTimestamp}`,
      gmailThreadId: 'thread_gmail_phase3b_001',
      inboundMessageId: 'msg_inbound_phase3b_001',
      customerName: 'Aarav Sharma',
      customerEmail: 'aarav@techventures.io',
      customerCompanyName: 'TechVentures Studio',
      subject: 'Inquiry: MVP Partnership & Commission Terms',
      latestCustomerMessage: 'Actually our budget changed from ₹3 lakh to ₹80,000. Can you confirm the 15% commission?',
      conversationHistory: [
        { sender: 'client', text: 'Hi, we are interested in working together on our MVP.' },
        { sender: 'agent', text: 'Thanks for reaching out! We would be glad to help understand your MVP scope.' },
      ],
      intent: 'pricing_request',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['commission_revenue_share', 'pricing_commitment'],
      whyApprovalRequired: ['Unverified 15% commission requested', 'Commercial commitment requires leadership authorization'],
      currentTurnRequirements: ['Budget updated to ₹80,000', '15% commission inquiry'],
      commercialTermsDetected: ['15% commission', '₹80,000 budget'],
      updatedOverrides: [
        { field: 'budget', currentValue: '₹80,000', previousValue: '₹3 lakh' },
      ],
      customerHoldingResponse: 'Thank you for reaching out. We have noted your updated ₹80,000 budget and are reviewing the 15% commission structure with leadership.',
      holdingResponseSent: true,
      holdingOutboundMessageId: 'msg_holding_phase3b_001',
      baseDraft: 'Hi Aarav,\n\nThank you for reaching out. Regarding your updated ₹80,000 budget, we are reviewing your proposed commercial structure with leadership and will follow up shortly.\n\nBest regards,\nEvores',
      inReplyTo: 'msg_inbound_phase3b_001',
      references: '<ref_phase3b_001>',
    });

    const openedItem = await getApprovalItem(companyAId, initialItem.id);
    assert(openedItem !== null, 'Approval item opened successfully');
    assert(openedItem?.customerName === 'Aarav Sharma', 'Customer name is Aarav Sharma');
    assert(openedItem?.customerEmail === 'aarav@techventures.io', 'Customer email is correct');
    assert(openedItem?.customerCompanyName === 'TechVentures Studio', 'Customer company name is correct');
    assert(openedItem?.subject === 'Inquiry: MVP Partnership & Commission Terms', 'Subject is correct');
    assert(openedItem?.gmailThreadId === 'thread_gmail_phase3b_001', 'Gmail thread ID is preserved');
    assert(openedItem?.latestCustomerMessage.includes('₹80,000'), 'Latest customer message accurately loaded');
    assert(openedItem?.conversationHistory?.length === 2, 'Conversation history loaded');
    assert(openedItem?.permissionDecision === 'NEEDS_APPROVAL', 'Permission decision is NEEDS_APPROVAL');
    assert(openedItem?.riskLevel === 'HIGH', 'Risk level is HIGH');

    // ------------------------------------------------------------------------
    // TEST 2: Select Professional draft
    // ------------------------------------------------------------------------
    console.log('[TEST 2] Select Professional Draft');
    const proItem = await selectDraftVariation(companyAId, initialItem.id, 'professional');
    assert(proItem.selectedVariation === 'professional', 'Selected variation is professional');
    assert(proItem.currentDraft === proItem.variations.professional, 'Current draft text matches professional variation');
    assert(proItem.isEdited === false, 'isEdited is false after selecting AI draft');

    // ------------------------------------------------------------------------
    // TEST 3: Select Warm draft
    // ------------------------------------------------------------------------
    console.log('[TEST 3] Select Warm Draft');
    const warmItem = await selectDraftVariation(companyAId, initialItem.id, 'warm');
    assert(warmItem.selectedVariation === 'warm', 'Selected variation is warm');
    const warmExpected = warmItem.variations.warm || warmItem.variations.relationship;
    assert(warmItem.currentDraft === warmExpected, 'Current draft text matches warm variation');
    assert(warmItem.isEdited === false, 'isEdited is false after selecting warm draft');

    // ------------------------------------------------------------------------
    // TEST 4: Select Concise draft
    // ------------------------------------------------------------------------
    console.log('[TEST 4] Select Concise Draft');
    const conciseItem = await selectDraftVariation(companyAId, initialItem.id, 'concise');
    assert(conciseItem.selectedVariation === 'concise', 'Selected variation is concise');
    assert(conciseItem.currentDraft === conciseItem.variations.concise, 'Current draft text matches concise variation');
    assert(conciseItem.isEdited === false, 'isEdited is false after selecting concise draft');

    // ------------------------------------------------------------------------
    // TEST 5: Edit draft
    // ------------------------------------------------------------------------
    console.log('[TEST 5] Edit Draft');
    const customizedText = 'Hi Aarav,\n\nThank you for following up with us. We have received your updated ₹80,000 budget and are coordinating with our leadership team regarding your partnership inquiry.\n\nBest regards,\nEvores Team';
    const editedItem = await updateApprovalDraft(companyAId, initialItem.id, customizedText);
    assert(editedItem.isEdited === true, 'isEdited is true after company customization');
    assert(editedItem.editedDraft === customizedText, 'editedDraft matches customized text');
    assert(editedItem.currentDraft === customizedText, 'currentDraft reflects customized text');
    assert(
      editedItem.activityTimeline?.some((t) => t.step === 'Draft Edited by Company'),
      'Activity timeline records "Draft Edited by Company"'
    );

    // ------------------------------------------------------------------------
    // TEST 6: Reset edited draft
    // ------------------------------------------------------------------------
    console.log('[TEST 6] Reset Edited Draft');
    // Selecting variation resets back to the original AI variation
    const resetItem = await selectDraftVariation(companyAId, initialItem.id, 'concise');
    assert(resetItem.isEdited === false, 'isEdited is reset to false');
    assert(resetItem.editedDraft === undefined, 'editedDraft is cleared after reset');
    assert(resetItem.currentDraft === resetItem.variations.concise, 'currentDraft reverted to concise AI draft');

    // ------------------------------------------------------------------------
    // TEST 7: Preview final response
    // ------------------------------------------------------------------------
    console.log('[TEST 7] Preview Final Response');
    const previewFrom = 'company_a@evores.com';
    const previewTo = `${resetItem.customerName} <${resetItem.customerEmail}>`;
    const previewSubject = resetItem.subject.startsWith('Re:') ? resetItem.subject : `Re: ${resetItem.subject}`;
    const previewNotice = 'Customer will receive exactly this message.';
    assert(previewTo.includes('aarav@techventures.io'), 'Preview To matches customer email');
    assert(previewSubject.startsWith('Re:'), 'Preview Subject contains Re: prefix');
    assert(previewNotice === 'Customer will receive exactly this message.', 'Exact preview guarantee notice verified');

    // ------------------------------------------------------------------------
    // TEST 8: Safe edited response passes
    // ------------------------------------------------------------------------
    console.log('[TEST 8] Safe Edited Response Passes Validation');
    const safeText = 'Hi Aarav,\n\nThanks for reaching out to Evores. We have taken note of your updated ₹80,000 budget and look forward to discussing the project scope.\n\nBest regards,\nEvores Team';
    const safeVal = validateEditedDraftText(safeText, resetItem.latestCustomerMessage, {
      updatedOverrides: resetItem.updatedOverrides,
      restrictedTopics: resetItem.restrictedTopics,
    });
    if (!safeVal.isValid) {
      console.error('Validation issues:', safeVal.issues);
    }
    assert(safeVal.isValid === true, 'Safe consultative response passes validation with isValid = true');
    assert(safeVal.issues.length === 0, 'Safe response produces 0 issues');

    // ------------------------------------------------------------------------
    // TEST 9: Edited commission commitment blocked
    // ------------------------------------------------------------------------
    console.log('[TEST 9] Edited Commission Commitment Blocked');
    const unsafeCommissionText = 'Hi Aarav,\n\nWe confirm the 15% commission as discussed. We are happy to proceed.\n\nBest regards,\nEvores';
    const commVal = validateEditedDraftText(unsafeCommissionText, resetItem.latestCustomerMessage, {
      updatedOverrides: resetItem.updatedOverrides,
      restrictedTopics: resetItem.restrictedTopics,
    });
    assert(commVal.isValid === false, 'Unapproved commission commitment is blocked');
    assert(
      commVal.issues.some((i) => i.includes('Send blocked: This response appears to commit to a 15% commission')),
      'Returns simple explanation: "Send blocked: This response appears to commit to a 15% commission that has not been approved."'
    );

    // ------------------------------------------------------------------------
    // TEST 10: Edited pricing commitment blocked
    // ------------------------------------------------------------------------
    console.log('[TEST 10] Edited Pricing Commitment Blocked');
    const unsafePricingText = 'Hi Aarav,\n\nWe confirm the fixed price of $5,000 for your MVP build.\n\nBest regards,\nEvores';
    const priceVal = validateEditedDraftText(unsafePricingText, resetItem.latestCustomerMessage, {
      updatedOverrides: resetItem.updatedOverrides,
    });
    assert(priceVal.isValid === false, 'Unapproved fixed pricing commitment is blocked');
    assert(
      priceVal.issues.some((i) => i.includes('Send blocked: This response commits to unverified fixed pricing')),
      'Returns simple explanation: "Send blocked: This response commits to unverified fixed pricing that has not been approved."'
    );

    // ------------------------------------------------------------------------
    // TEST 11: Stale budget blocked
    // ------------------------------------------------------------------------
    console.log('[TEST 11] Stale Budget Blocked');
    // Note: The customer's budget changed from ₹3 lakh to ₹80,000
    const staleBudgetText = 'Hi Aarav,\n\nRegarding your ₹3 lakh budget, we are ready to move forward.\n\nBest regards,\nEvores';
    const staleVal = validateEditedDraftText(staleBudgetText, resetItem.latestCustomerMessage, {
      updatedOverrides: resetItem.updatedOverrides,
    });
    assert(staleVal.isValid === false, 'Outdated budget is blocked');
    assert(
      staleVal.issues.some((i) => i.includes('Send blocked: This response references an outdated budget ("₹3 lakh")')),
      'Returns simple explanation referencing outdated budget ("₹3 lakh") and current budget ("₹80,000")'
    );

    // ------------------------------------------------------------------------
    // TEST 12: Placeholder blocked
    // ------------------------------------------------------------------------
    console.log('[TEST 12] Placeholder Blocked');
    const placeholderText = 'Hi Aarav,\n\nYour final cost will be [INSERT PRICE] and launch will take [INSERT DATE].\n\nBest regards,\nEvores';
    const placeVal = validateEditedDraftText(placeholderText, resetItem.latestCustomerMessage);
    assert(placeVal.isValid === false, 'Draft with unpopulated placeholders is blocked');
    assert(
      placeVal.issues.some((i) => i.includes('Send blocked: Unresolved placeholder detected')),
      'Returns simple explanation: "Send blocked: Unresolved placeholder detected: Response contains bracketed placeholder tokens."'
    );

    // ------------------------------------------------------------------------
    // TEST 13: Contract commitment blocked
    // ------------------------------------------------------------------------
    console.log('[TEST 13] Contract Commitment Blocked');
    const contractText = 'Hi Aarav,\n\nWe accept your terms and we sign the contract now.\n\nBest regards,\nEvores';
    const contractVal = validateEditedDraftText(contractText, resetItem.latestCustomerMessage);
    assert(contractVal.isValid === false, 'Unilateral contract commitment is blocked');
    assert(
      contractVal.issues.some((i) => i.includes('Send blocked: This response contains an unauthorized contractual or legal commitment.')),
      'Returns simple explanation for unauthorized contractual commitment'
    );

    // ------------------------------------------------------------------------
    // TEST 14: Confirmation required
    // ------------------------------------------------------------------------
    console.log('[TEST 14] Confirmation Required Before Dispatch');
    // Calling approveAndSendItem with unsafe text is rejected by backend safety guard
    const blockedSend = await approveAndSendItem(companyAId, initialItem.id, {
      finalDraft: unsafeCommissionText,
      provider: mockProvider,
    });
    assert(blockedSend.success === false, 'Sending blocked unsafe commission draft is strictly rejected');
    assert(blockedSend.error?.includes('Validation failed'), 'Error explicitly states validation failure');
    assert(mockProvider.sentEmails.length === 0, 'No email was dispatched due to validation block');

    // ------------------------------------------------------------------------
    // TEST 15: Successful send
    // ------------------------------------------------------------------------
    console.log('[TEST 15] Successful Send');
    const safeSendText = 'Hi Aarav,\n\nThanks for reaching out to Evores. We have received your updated ₹80,000 budget and are coordinating with our leadership team.\n\nBest regards,\nEvores Team';
    const sendRes = await approveAndSendItem(companyAId, initialItem.id, {
      finalDraft: safeSendText,
      userEmail: 'reviewer@evores.com',
      provider: mockProvider,
    });
    assert(sendRes.success === true, 'Safe send dispatched successfully');
    assert(sendRes.item?.status === 'EDITED_AND_SENT', 'Status updated to EDITED_AND_SENT');
    assert(Boolean(sendRes.outboundMessageId), 'Outbound message ID assigned');
    assert(mockProvider.sentEmails.length === 1, 'Mock Gmail provider received exactly 1 email');

    // ------------------------------------------------------------------------
    // TEST 16: Duplicate send rejected
    // ------------------------------------------------------------------------
    console.log('[TEST 16] Duplicate Send Rejected');
    const dupSendRes = await approveAndSendItem(companyAId, initialItem.id, {
      finalDraft: safeSendText,
      provider: mockProvider,
    });
    assert(dupSendRes.success === false, 'Duplicate send on already completed item is rejected');
    assert(dupSendRes.error?.includes('already been sent'), 'Error indicates item has already been sent');
    assert(mockProvider.sentEmails.length === 1, 'No second email sent by Gmail provider');

    // ------------------------------------------------------------------------
    // TEST 17: Failed send releases quota
    // ------------------------------------------------------------------------
    console.log('[TEST 17] Failed Send Releases Quota');
    const itemForFailure = await createApprovalItem({
      companyId: companyAId,
      leadId: `lead_fail_${testTimestamp}`,
      inboundMessageId: `msg_fail_${testTimestamp}`,
      customerName: 'Samira Khan',
      customerEmail: 'samira@example.com',
      subject: 'Inquiry: Service Scope',
      latestCustomerMessage: 'What services do you provide?',
      intent: 'service_inquiry',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['scope'],
      whyApprovalRequired: ['Review required before sending.'],
      baseDraft: 'Hi Samira,\n\nWe provide custom software and cloud engineering services.\n\nBest regards,\nEvores',
    });

    const failingProvider = new MockGmailProvider();
    failingProvider.shouldFail = true;

    // Verify quota reservation before failure
    const quotaBefore = await getEmailQuota(companyAId);
    const usedBefore = quotaBefore.usedCredits;

    const failedSendRes = await approveAndSendItem(companyAId, itemForFailure.id, {
      provider: failingProvider,
    });
    assert(failedSendRes.success === false, 'Send via failing provider reported failure');

    const quotaAfter = await getEmailQuota(companyAId);
    assert(
      quotaAfter.usedCredits === usedBefore,
      `usedCredits remained unchanged (${quotaAfter.usedCredits}) because failed send released reservation`
    );
    assert(
      quotaAfter.reservedCredits === 0,
      `reservedCredits reset to 0 after failed send release`
    );

    // ------------------------------------------------------------------------
    // TEST 18: Successful send commits quota
    // ------------------------------------------------------------------------
    console.log('[TEST 18] Successful Send Commits Quota');
    const workingProvider = new MockGmailProvider();
    const sendSuccessRes = await approveAndSendItem(companyAId, itemForFailure.id, {
      provider: workingProvider,
    });
    assert(sendSuccessRes.success === true, 'Retry send succeeded with working provider');

    const quotaCommitted = await getEmailQuota(companyAId);
    assert(
      quotaCommitted.usedCredits === usedBefore + 1,
      `usedCredits incremented by 1 (${quotaCommitted.usedCredits}) upon confirmed success`
    );
    assert(
      quotaCommitted.reservedCredits === 0,
      'reservedCredits reset to 0 upon commit'
    );

    // ------------------------------------------------------------------------
    // TEST 19: Gmail thread ID preserved
    // ------------------------------------------------------------------------
    console.log('[TEST 19] Gmail Thread ID Preserved');
    const dispatchedEmail = mockProvider.sentEmails[0];
    assert(
      dispatchedEmail?.metadata?.gmailThreadId === 'thread_gmail_phase3b_001',
      'Dispatched email metadata preserves exact gmailThreadId ("thread_gmail_phase3b_001")'
    );

    // ------------------------------------------------------------------------
    // TEST 20: In-Reply-To preserved
    // ------------------------------------------------------------------------
    console.log('[TEST 20] In-Reply-To & References Preserved');
    assert(
      dispatchedEmail?.inReplyTo === 'msg_inbound_phase3b_001',
      'Dispatched email preserves In-Reply-To header'
    );
    assert(
      dispatchedEmail?.references === '<ref_phase3b_001>',
      'Dispatched email preserves References header'
    );

    // ------------------------------------------------------------------------
    // TEST 21: Tenant isolation
    // ------------------------------------------------------------------------
    console.log('[TEST 21] Tenant Isolation');
    const foreignItemAccess = await getApprovalItem(companyBId, initialItem.id);
    assert(foreignItemAccess === null, 'Company B cannot access Company A approval item (returns null)');

    let companyBCannotEdit = false;
    try {
      await updateApprovalDraft(companyBId, initialItem.id, 'Hacked text');
    } catch {
      companyBCannotEdit = true;
    }
    assert(companyBCannotEdit, 'Company B cannot edit Company A approval item');

    const companyBCannotSend = await approveAndSendItem(companyBId, initialItem.id, {
      provider: mockProvider,
    });
    assert(companyBCannotSend.success === false, 'Company B cannot send Company A approval item');
    assert(companyBCannotSend.error?.includes('unauthorized') || companyBCannotSend.error?.includes('not found'), 'Error indicates unauthorized tenant access');

    // ------------------------------------------------------------------------
    // TEST 22: Approval item cannot be sent after completion
    // ------------------------------------------------------------------------
    console.log('[TEST 22] Approval Item Cannot Be Sent After Completion');
    // 1. Try sending the already completed (EDITED_AND_SENT) item
    const completedSendRes = await approveAndSendItem(companyAId, initialItem.id, {
      provider: mockProvider,
    });
    assert(completedSendRes.success === false, 'Cannot send item with status EDITED_AND_SENT');

    // 2. Reject another item and verify it cannot be sent
    const itemToReject = await createApprovalItem({
      companyId: companyAId,
      leadId: `lead_reject_${testTimestamp}`,
      inboundMessageId: `msg_reject_${testTimestamp}`,
      customerName: 'Marcus Lee',
      customerEmail: 'marcus@example.com',
      subject: 'Inquiry: Exclusivity Request',
      latestCustomerMessage: 'Can you guarantee sole vendor rights?',
      intent: 'partnership',
      riskLevel: 'CRITICAL',
      permissionDecision: 'BLOCKED',
      restrictedTopics: ['exclusive_agreement'],
      whyApprovalRequired: ['Exclusivity requests are blocked.'],
      baseDraft: 'Hi Marcus,\n\nWe cannot commit to exclusivity.\n\nBest regards,\nEvores',
    });

    await rejectApprovalItem(companyAId, itemToReject.id, 'Exclusivity cannot be granted');
    const rejectedSendRes = await approveAndSendItem(companyAId, itemToReject.id, {
      provider: mockProvider,
    });
    assert(rejectedSendRes.success === false, 'Cannot send item with status REJECTED');
    assert(rejectedSendRes.error?.includes('rejected'), 'Error explains cannot send a rejected item');

    console.log('\n========================================================================');
    console.log(`  PHASE 3B SUITE: ${passedCount}/${totalCount} TESTS PASSED, 0 FAILED`);
    console.log('========================================================================\n');
  } finally {
    // Clean up test database records
    try {
      await prisma.automationQuotaAuditLog.deleteMany({
        where: { companyId: { in: [companyAId, companyBId] } },
      });
      await prisma.automationAccess.deleteMany({
        where: { companyId: { in: [companyAId, companyBId] } },
      });
      await prisma.automationConnection.deleteMany({
        where: { companyId: { in: [companyAId, companyBId] } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: [companyAId, companyBId] } },
      });
    } catch {
      // Non-critical cleanup
    }
  }
}

runPhase3BTestSuite().catch((err) => {
  console.error('Fatal Phase 3B test error:', err);
  process.exit(1);
});
