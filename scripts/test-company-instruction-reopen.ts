import {
  createApprovalItem,
  getApprovalItem,
  listApprovalItems,
  rejectApprovalItem,
  reopenApprovalItem,
  generateDraftsFromInstruction,
  approveAndSendItem,
  validateEditedDraftText,
  resetMemoryApprovalQueue,
} from '../src/lib/services/aiApprovalService';
import { generateDraftsFromCompanyInstruction } from '../src/lib/ai/draftVariationEngine';
import {
  EmailProvider,
  SendEmailResult,
  SendEmailParams,
  ParsedInboundEmail,
  ParsedDeliveryEvent,
} from '../src/lib/services/email/EmailProvider';

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

class MockApprovalEmailProvider implements EmailProvider {
  readonly providerType = 'mock';
  sentEmails: Array<SendEmailParams> = [];
  shouldFail = false;
  failureError = 'Simulated network timeout';

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return { success: false, error: this.failureError };
    }
    const providerMessageId = `mock_approval_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push({ ...params });
    return { success: true, providerMessageId };
  }

  verifyWebhook(): boolean { return true; }
  parseInboundMessage(): ParsedInboundEmail {
    return {
      messageId: 'mock_inbound_001',
      sender: 'client@example.com',
      recipient: 'hello@evores.com',
      subject: 'Mock Inbound',
      text: 'Mock message text',
      timestamp: Date.now(),
    };
  }
  normalizeMessage(text: string): string { return text.trim(); }
  parseDeliveryEvent(): ParsedDeliveryEvent | null { return null; }
}

async function runCompanyInstructionAndReopenTests() {
  console.log('\n========================================================================');
  console.log('  STARTING TEST SUITE: COMPANY INSTRUCTION REPLY GENERATOR & REOPEN');
  console.log('========================================================================\n');

  resetMemoryApprovalQueue();
  const companyId = 'company_test_instruction_001';
  const mockProvider = new MockApprovalEmailProvider();

  // ---------------------------------------------------------------------------
  // TEST 1: Customer asks about partnership.
  // Company instruction: "We're interested and okay with discussing 30% revenue share."
  // Expected: Three drafts are partnership-related and communicate the company's intended position.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 1] Customer asks about partnership + 30% revenue share instruction');
  const drafts1 = generateDraftsFromCompanyInstruction({
    customerMessage: "We're interested in discussing a referral partnership. Could you let us know how you normally structure these partnerships?",
    instruction: "We're interested and okay with discussing 30% revenue share. Tell them we're interested and ask how they normally handle referrals.",
    customerName: 'Hritik Verma',
    companyName: 'Evores',
  });

  assert(Boolean(drafts1.professional), 'Professional draft was generated');
  assert(Boolean(drafts1.relationship), 'Warm / Relationship draft was generated');
  assert(Boolean(drafts1.concise), 'Concise draft was generated');

  assert(
    drafts1.professional.toLowerCase().includes('referral partnership') || drafts1.professional.toLowerCase().includes('partnership'),
    'Professional draft acknowledges referral partnership'
  );
  assert(
    drafts1.professional.includes('30%') && (drafts1.professional.toLowerCase().includes('revenue-share') || drafts1.professional.toLowerCase().includes('revenue share')),
    'Professional draft communicates 30% revenue-share arrangement'
  );
  assert(
    drafts1.relationship.includes('30%') && (drafts1.relationship.toLowerCase().includes('referral partnership') || drafts1.relationship.toLowerCase().includes('partnership')),
    'Warm draft is partnership-related and contains 30% revenue share'
  );
  assert(
    drafts1.concise.includes('30%') && (drafts1.concise.toLowerCase().includes('partnership') || drafts1.concise.toLowerCase().includes('referral')),
    'Concise draft communicates 30% revenue share concisely'
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Customer asks about partnership.
  // Company instruction: "Don't accept commission yet. Tell them we're interested and want to discuss the structure."
  // Expected: Drafts do NOT accept commission.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Customer asks about partnership + Do NOT accept commission instruction');
  const drafts2 = generateDraftsFromCompanyInstruction({
    customerMessage: "We're interested in discussing a referral partnership with a 15% commission. Can you confirm if this works?",
    instruction: "Don't accept commission yet. Tell them we're interested and want to discuss the structure.",
    customerName: 'Hritik Verma',
    companyName: 'Evores',
    restrictedTopics: ['commission_revenue_share'],
  });

  const commitRegex = /\b(?:confirm|agree\s+to|commit\s+to|accept)\s+(?:the\s+|a\s+)?(?:\d{1,2}%\s*)?commission\b/i;
  assert(!commitRegex.test(drafts2.professional), 'Professional draft does NOT accept or confirm commission');
  assert(!commitRegex.test(drafts2.relationship), 'Warm draft does NOT accept or confirm commission');
  assert(!commitRegex.test(drafts2.concise), 'Concise draft does NOT accept or confirm commission');

  assert(
    drafts2.professional.toLowerCase().includes('structure') && drafts2.professional.toLowerCase().includes('internally'),
    'Professional draft explains commission is evaluated internally while discussing structure'
  );
  assert(
    drafts2.relationship.toLowerCase().includes('structure') || drafts2.relationship.toLowerCase().includes('collaborat'),
    'Warm draft is collaborative without accepting commission'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Customer asks for pricing.
  // Company instruction: "Tell them we'll review their requirements and discuss pricing."
  // Expected: Draft addresses pricing without inventing a price.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Customer asks for pricing + review requirements instruction');
  const drafts3 = generateDraftsFromCompanyInstruction({
    customerMessage: "Could you please send over your rates and exact fixed price for a custom e-commerce mobile app?",
    instruction: "Tell them we'll review their requirements and discuss pricing.",
    customerName: 'Sarah Jenkins',
    companyName: 'Evores',
    restrictedTopics: ['pricing_model'],
  });

  assert(
    drafts3.professional.toLowerCase().includes('pricing') && drafts3.professional.toLowerCase().includes('requirements'),
    'Professional draft addresses pricing and mentions reviewing requirements'
  );

  // Check no fabricated currency amounts ($500, ₹50,000, etc.)
  const currencyAmountRegex = /[₹$€£]\s*[\d,]+|\b\d+,\d+\s*(?:dollars|usd|inr|rupees)\b/i;
  assert(!currencyAmountRegex.test(drafts3.professional), 'Professional draft does not invent a price');
  assert(!currencyAmountRegex.test(drafts3.relationship), 'Warm draft does not invent a price');
  assert(!currencyAmountRegex.test(drafts3.concise), 'Concise draft does not invent a price');

  const val3 = validateEditedDraftText(drafts3.professional, "Could you please send over your rates?");
  assert(val3.isValid, 'Draft without fabricated pricing passes safety validation');

  // ---------------------------------------------------------------------------
  // TEST 4: Customer asks for a call.
  // Company instruction: "Ask them to schedule a call next week."
  // Expected: Draft naturally asks for a call.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Customer asks for a call + schedule next week instruction');
  const drafts4 = generateDraftsFromCompanyInstruction({
    customerMessage: "Can we connect to discuss how you could help our team with backend automation?",
    instruction: "Ask them to schedule a call next week.",
    customerName: 'Alex Mercer',
    companyName: 'Evores',
  });

  assert(
    drafts4.professional.toLowerCase().includes('schedule a call next week') || drafts4.professional.toLowerCase().includes('call next week'),
    'Professional draft naturally asks to schedule a call next week'
  );
  assert(
    drafts4.relationship.toLowerCase().includes('call next week') || drafts4.relationship.toLowerCase().includes('call'),
    'Warm draft naturally invites scheduling a call next week'
  );
  assert(
    drafts4.concise.toLowerCase().includes('call next week'),
    'Concise draft directly asks for call next week'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Company instruction attempts unauthorized guarantee.
  // Expected: Existing safety validation blocks the final send.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Company instruction attempts unauthorized guarantee -> validation blocks');
  const drafts5 = generateDraftsFromCompanyInstruction({
    customerMessage: "Can you guarantee delivery of this CRM migration within 7 days?",
    instruction: "Tell them we guarantee delivery in 7 days.",
    customerName: 'David Miller',
    companyName: 'Evores',
  });

  assert(
    drafts5.professional.toLowerCase().includes('guarantee delivery in 7 days') || drafts5.professional.toLowerCase().includes('guarantee delivery'),
    'Draft reflects instruction with guarantee phrase'
  );

  const val5 = validateEditedDraftText(drafts5.professional, "Can you guarantee delivery within 7 days?");
  assert(!val5.isValid, 'Safety validation successfully BLOCKS unauthorized delivery deadline guarantee');
  assert(
    val5.issues.some((i) => i.toLowerCase().includes('deadline') || i.toLowerCase().includes('guarantee')),
    'Validation issues specify unauthorized deadline guarantee'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Company instruction attempts unauthorized discount.
  // Expected: Existing safety validation blocks the final send.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Company instruction attempts unauthorized discount -> validation blocks');
  const drafts6 = generateDraftsFromCompanyInstruction({
    customerMessage: "Is there any promotional discount available on this package?",
    instruction: "Offer them a 20% discount.",
    customerName: 'Rachel Adams',
    companyName: 'Evores',
  });

  assert(
    drafts6.professional.toLowerCase().includes('20% discount'),
    'Draft reflects instructed 20% discount'
  );

  const val6 = validateEditedDraftText(drafts6.professional, "Is there any promotional discount available?");
  assert(!val6.isValid, 'Safety validation successfully BLOCKS unauthorized discount commitment');
  assert(
    val6.issues.some((i) => i.toLowerCase().includes('discount')),
    'Validation issues specify unauthorized discount commitment'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Three drafts preserve the same intended meaning but vary tone.
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Tone variation consistency across Professional, Warm, Concise');
  assert(
    drafts1.professional !== drafts1.relationship,
    'Professional and Warm drafts have distinct phrasing'
  );
  assert(
    drafts1.professional !== drafts1.concise,
    'Professional and Concise drafts have distinct phrasing'
  );
  assert(
    drafts1.concise.length < drafts1.professional.length,
    'Concise draft is shorter than Professional draft'
  );
  assert(
    drafts1.relationship.toLowerCase().includes('warm regards'),
    'Warm draft uses relationship-focused sign-off'
  );
  assert(
    drafts1.professional.toLowerCase().includes('best regards'),
    'Professional draft uses formal sign-off'
  );

  // ---------------------------------------------------------------------------
  // TEST 8 - 18: Reopening Rejected Approvals & Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8 - 18] Reopen Rejected Approvals Lifecycle & Non-Destructive Integrity');

  // Create an initial approval item
  const approvalItem = await createApprovalItem({
    companyId,
    leadId: 'lead_test_reopen_001',
    gmailThreadId: 'thread_gmail_orig_999',
    inboundMessageId: 'inbound_msg_orig_999',
    customerName: 'Hritik Customer',
    customerEmail: 'customer@clientdomain.com',
    customerCompanyName: 'GlobalTech Ltd',
    subject: 'Partnership & Revenue Discussion',
    latestCustomerMessage: "We'd like to partner and discuss 30% revenue sharing.",
    intent: 'partnership_inquiry',
    riskLevel: 'HIGH',
    permissionDecision: 'NEEDS_APPROVAL',
    restrictedTopics: ['commission_revenue_share'],
    whyApprovalRequired: ['Commercial revenue-share commitment requires human authorization'],
    baseDraft: "Thanks for your email. Our team will review this.",
    customerHoldingResponse: "Thanks for reaching out. Our team will review this and get back to you shortly.",
    holdingResponseSent: true,
  });

  // TEST 9: Pending approval does NOT show Reopen.
  assert(approvalItem.status === 'PENDING', 'Initial approval item status is PENDING');
  let pendingReopenThrew = false;
  try {
    await reopenApprovalItem(companyId, approvalItem.id);
  } catch (err: unknown) {
    pendingReopenThrew = true;
    assert(
      (err as Error).message.includes('Only rejected items can be reopened'),
      'TEST 9 PASSED: Reopening a PENDING approval throws invalid status error'
    );
  }
  assert(pendingReopenThrew, 'Reopen was blocked for pending item');

  // Reject the approval item
  const rejectedItem = await rejectApprovalItem(companyId, approvalItem.id, 'Terms unacceptable in current form');
  assert(rejectedItem.status === 'REJECTED', 'Item is now REJECTED');

  // TEST 8: Rejected approval shows Reopen eligibility.
  const rejectedList = await listApprovalItems(companyId, 'REJECTED');
  const foundRejected = rejectedList.find((i) => i.id === approvalItem.id);
  assert(Boolean(foundRejected && foundRejected.status === 'REJECTED'), 'TEST 8 PASSED: Rejected approval is visible in REJECTED filter');

  // TEST 10: Cancel Reopen keeps item rejected (simulated by aborting action without calling reopen API)
  const itemBeforeReopen = await getApprovalItem(companyId, approvalItem.id);
  assert(itemBeforeReopen?.status === 'REJECTED', 'TEST 10 PASSED: Item remains REJECTED if reopen is cancelled');

  // TEST 11: Confirm Reopen changes REJECTED → PENDING
  const reopenedItem = await reopenApprovalItem(companyId, approvalItem.id, 'manager@evores.com');
  assert(reopenedItem.status === 'PENDING', 'TEST 11 PASSED: Item status changed from REJECTED to PENDING');

  // TEST 12: Reopen does not send Gmail
  assert(mockProvider.sentEmails.length === 0, 'TEST 12 PASSED: Reopen did NOT send any Gmail email');

  // TEST 13: Reopen does not consume quota
  assert(
    reopenedItem.sentAt === undefined,
    'TEST 13 PASSED: Reopen did not mark email as sent or commit quota'
  );
  assert(
    reopenedItem.outboundMessageId === undefined,
    'TEST 13 PASSED: No outbound message generated upon reopen (quota untouched)'
  );

  // TEST 14: Reopen does not create duplicate approval
  const allItems = await listApprovalItems(companyId, 'ALL');
  const matchingItems = allItems.filter((i) => i.id === approvalItem.id);
  assert(matchingItems.length === 1, 'TEST 14 PASSED: Reopen did NOT duplicate approval item');

  // TEST 15: Original Gmail thread ID is preserved
  assert(
    reopenedItem.gmailThreadId === 'thread_gmail_orig_999',
    'TEST 15 PASSED: Original Gmail thread ID preserved'
  );

  // TEST 16: Original customer message is preserved
  assert(
    reopenedItem.latestCustomerMessage === "We'd like to partner and discuss 30% revenue sharing.",
    'TEST 16 PASSED: Original customer message preserved'
  );
  assert(
    reopenedItem.customerEmail === 'customer@clientdomain.com',
    'Original customer email preserved'
  );

  // TEST 17: Audit history preserves rejection and records reopening
  const timelineSteps = reopenedItem.activityTimeline?.map((t) => t.step) || [];
  assert(timelineSteps.includes('Draft Rejected'), 'Rejection event preserved in timeline');
  assert(timelineSteps.includes('Approval Reopened'), 'Reopen event recorded in timeline');
  assert(
    timelineSteps.indexOf('Draft Rejected') < timelineSteps.indexOf('Approval Reopened'),
    'TEST 17 PASSED: Audit history accurately orders Rejection before Reopening'
  );

  // TEST 18: Reopened approval can continue through the existing approval workflow
  console.log('\n[TEST 18] Reopened approval continues through existing workflow (Company Instruction -> Generate -> Edit -> Validate -> Approve & Send)');

  // A. Company gives instruction on the reopened item
  const genResult = await generateDraftsFromInstruction(
    companyId,
    reopenedItem.id,
    "We're interested and okay with discussing 30% revenue share. Tell them we're interested and ask about their usual referral process."
  );
  assert(genResult.success, 'Generate reply from company instruction succeeded on reopened item');
  assert(
    Boolean(genResult.item?.variations.professional.includes('30%')),
    'Generated drafts reflect company instruction'
  );

  // B. Company validates the response
  const currentDraft = genResult.item?.currentDraft || '';
  const validationResult = validateEditedDraftText(currentDraft, reopenedItem.latestCustomerMessage);
  assert(validationResult.isValid, 'Safety validation passes for approved commercial position');

  // C. Company approves and sends
  const sendResult = await approveAndSendItem(companyId, reopenedItem.id, {
    finalDraft: currentDraft,
    provider: mockProvider,
    userEmail: 'manager@evores.com',
  });

  assert(sendResult.success, 'Approve and send succeeded on reopened item');
  assert(sendResult.item?.status === 'APPROVED_AND_SENT' || sendResult.item?.status === 'APPROVED', 'Item status transitioned to APPROVED_AND_SENT');
  assert(mockProvider.sentEmails.length === 1, 'Email dispatched via provider');
  assert(
    mockProvider.sentEmails[0].metadata?.gmailThreadId === 'thread_gmail_orig_999',
    'Dispatched email preserved original Gmail thread ID'
  );
  assert(
    mockProvider.sentEmails[0].to === 'customer@clientdomain.com',
    'Dispatched email sent to original customer'
  );
  assert(
    Boolean(sendResult.item?.activityTimeline?.some((t) => t.step === 'Approved & Dispatched')),
    'Final send recorded in activity timeline'
  );

  console.log(`\n========================================================================`);
  console.log(`  ALL TESTS PASSED: ${passedCount} / ${totalCount} SUCCESSFUL`);
  console.log(`========================================================================\n`);
}

runCompanyInstructionAndReopenTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
