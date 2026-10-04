import {
  createApprovalItem,
  getApprovalItem,
  listApprovalItems,
  selectDraftVariation,
  updateApprovalDraft,
  rejectApprovalItem,
  approveAndSendItem,
  validateEditedDraftText,
  regenerateApprovalDraft,
  resetMemoryApprovalQueue,
} from '../src/lib/services/aiApprovalService';
import { generateDraftVariations } from '../src/lib/ai/draftVariationEngine';
import { evaluatePermissionAndRisk } from '../src/lib/ai/permissionEngine';
import { CompanyContext } from '../src/lib/ai/types';
import {
  EmailProvider,
  SendEmailResult,
  SendEmailParams,
  ParsedInboundEmail,
  ParsedDeliveryEvent,
} from '../src/lib/services/email/EmailProvider';
import { buildStructuredConversationContext } from '../src/lib/ai/conversationMemory';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';

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
      return {
        success: false,
        error: this.failureError,
      };
    }

    const providerMessageId = `mock_approval_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push({
      ...params,
    });

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
      messageId: 'mock_inbound_001',
      sender: 'client@example.com',
      recipient: 'hello@evores.com',
      subject: 'Mock Inbound',
      text: 'Mock message text',
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


const mockCompanyContext: CompanyContext = {
  companyId: 'company_evores_001',
  name: 'Evores',
  industry: 'Software Development & IT Consulting',
  services: ['Custom Web Development', 'Mobile Apps', 'Cloud Infrastructure', 'Automation'],
  description: 'Specializing in robust digital systems and enterprise engineering.',
  pricingPolicy: 'Custom quote based on scope and deliverables.',
};

async function runApprovalQueueTestSuite() {
  console.log('========================================================================');
  console.log('       FILLFLOW PHASE 2: AI APPROVAL QUEUE TEST SUITE                  ');
  console.log('========================================================================\n');

  resetMemoryApprovalQueue();
  const mockProvider = new MockApprovalEmailProvider();

  // --------------------------------------------------------------------------
  // SECTION 1: APPROVAL ITEM CREATION & ROUTING (10 Tests)
  // --------------------------------------------------------------------------
  console.log('[SECTION 1] Approval Item Creation & Routing');
  {
    // Test 1: Item creation on NEEDS_APPROVAL
    const item1 = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_101',
      gmailThreadId: 'thread_abc_001',
      inboundMessageId: 'msg_inbound_001',
      customerName: 'Aarav Sharma',
      customerEmail: 'aarav@techventures.io',
      subject: 'Commercial Proposal & Discount',
      latestCustomerMessage: 'Can you offer a 20% discount on the MVP build?',
      intent: 'pricing_request',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['discount'],
      whyApprovalRequired: ['Customer requested an unverified discount percentage.'],
      customerHoldingResponse: 'Thanks for checking with us. I am confirming available commercial options with our team.',
      holdingResponseSent: true,
      holdingOutboundMessageId: 'holding_msg_101',
      baseDraft: 'Hi Aarav,\n\nWe can review the 20% discount for your MVP.\n\nBest regards,\nEvores',
      inReplyTo: 'msg_inbound_001',
      references: '<ref_001>',
    });

    assert(Boolean(item1.id), 'Approval item created with valid ID');
    assert(item1.status === 'PENDING', 'Initial approval item status is PENDING');
    assert(item1.riskLevel === 'HIGH', 'Risk level is HIGH');
    assert(item1.permissionDecision === 'NEEDS_APPROVAL', 'Permission decision is NEEDS_APPROVAL');
    assert(item1.customerHoldingResponse !== undefined, 'Customer holding response is recorded');
    assert(item1.holdingResponseSent === true, 'Holding response sent flag is true');
    assert(item1.gmailThreadId === 'thread_abc_001', 'Gmail thread ID preserved on approval item');
    assert(item1.inReplyTo === 'msg_inbound_001', 'In-Reply-To preserved on approval item');

    // Test 2: BLOCKED routing creates approval item
    const itemBlocked = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_102',
      inboundMessageId: 'msg_inbound_002',
      customerName: 'Robert Vance',
      customerEmail: 'rvance@refrigeration.com',
      subject: 'Exclusive Vendor Contract',
      latestCustomerMessage: 'We require an exclusive partnership where Evores cannot work with any competitors.',
      intent: 'partnership',
      riskLevel: 'CRITICAL',
      permissionDecision: 'BLOCKED',
      restrictedTopics: ['exclusive_agreement'],
      whyApprovalRequired: ['Exclusive partnerships are strictly blocked from automated AI approval.'],
      baseDraft: 'Hi Robert,\n\nWe cannot agree to exclusivity automatically.\n\nBest regards,\nEvores',
    });

    assert(itemBlocked.permissionDecision === 'BLOCKED', 'BLOCKED decision routes to approval queue');
    assert(itemBlocked.riskLevel === 'CRITICAL', 'BLOCKED item is CRITICAL risk');
  }

  // --------------------------------------------------------------------------
  // SECTION 2: 3 AI DRAFT VARIATIONS (10 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 2] 3 AI Draft Variations (Professional, Relationship, Concise)');
  {
    const variations = generateDraftVariations({
      messageText: 'Can you offer a 20% discount on the MVP build?',
      companyContext: mockCompanyContext,
      restrictedTopics: ['discount'],
      intent: 'pricing_request',
    });

    assert(Boolean(variations.professional), 'Professional variation generated');
    assert(Boolean(variations.relationship), 'Relationship-focused variation generated');
    assert(Boolean(variations.concise), 'Concise variation generated');

    // Variations must have different lengths/styles
    assert(variations.relationship.length > variations.concise.length, 'Relationship draft is more expansive than concise draft');
    assert(variations.concise.includes('shortly') || variations.concise.includes('pricing'), 'Concise draft gets straight to the point');

    // Validate each variation with response validator
    const valProf = validateCustomerResponse({
      reply: variations.professional,
      clientMessage: 'Can you offer a 20% discount on the MVP build?',
      companyContext: mockCompanyContext,
    });
    assert(valProf.isValid, 'Professional variation passes response validator');

    const valRel = validateCustomerResponse({
      reply: variations.relationship,
      clientMessage: 'Can you offer a 20% discount on the MVP build?',
      companyContext: mockCompanyContext,
    });
    assert(valRel.isValid, 'Relationship variation passes response validator');

    const valConc = validateCustomerResponse({
      reply: variations.concise,
      clientMessage: 'Can you offer a 20% discount on the MVP build?',
      companyContext: mockCompanyContext,
    });
    assert(valConc.isValid, 'Concise variation passes response validator');

    // Selection of variation
    const queueList = await listApprovalItems('company_evores_001', 'PENDING');
    const targetItem = queueList[0];
    const updatedWithRel = await selectDraftVariation('company_evores_001', targetItem.id, 'relationship');
    assert(updatedWithRel.selectedVariation === 'relationship', 'Variation selected is updated to relationship');
    assert(updatedWithRel.currentDraft === targetItem.variations.relationship, 'currentDraft reflects selected variation');
  }

  // --------------------------------------------------------------------------
  // SECTION 3: DRAFT EDITING & QUALITY VALIDATION (10 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 3] Draft Editing & Quality Validation');
  {
    const queueList = await listApprovalItems('company_evores_001', 'PENDING');
    const targetItem = queueList[0];

    // Edit draft text
    const customText = 'Hi Aarav,\n\nWe spoke with the founders and can offer a 10% commercial discount if we kick off this week.\n\nBest regards,\nEvores';
    const editedItem = await updateApprovalDraft('company_evores_001', targetItem.id, customText);

    assert(editedItem.isEdited === true, 'isEdited flag set to true');
    assert(editedItem.currentDraft === customText, 'currentDraft reflects edited text');
    assert(editedItem.editedDraft === customText, 'editedDraft stores custom text');

    // Validation passes for good edit
    const valGood = validateEditedDraftText(customText, targetItem.latestCustomerMessage);
    assert(valGood.isValid, 'Edited draft passes quality validation');

    // Validation fails for draft with unresolved placeholder
    const badDraftWithPlaceholder = 'Hi Aarav,\n\nYour discount will be [INSERT_DISCOUNT_PERCENTAGE] for the project.\n\nBest regards,\nEvores';
    const valPlaceholder = validateEditedDraftText(badDraftWithPlaceholder, targetItem.latestCustomerMessage);
    assert(!valPlaceholder.isValid, 'Unresolved placeholder fails validation');
    assert(valPlaceholder.issues.some((i) => i.toLowerCase().includes('placeholder')), 'Flags placeholder issue');

    // Attempting to send bad draft with placeholder is blocked
    const sendBadRes = await approveAndSendItem('company_evores_001', targetItem.id, {
      finalDraft: badDraftWithPlaceholder,
      provider: mockProvider,
    });
    assert(!sendBadRes.success, 'Sending draft with placeholders is strictly blocked');
    assert(Boolean(sendBadRes.error?.includes('placeholder')), 'Blocked reason explicitly mentions placeholder');

    // Resetting variation clears custom edit
    const resetItem = await selectDraftVariation('company_evores_001', targetItem.id, 'concise');
    assert(resetItem.isEdited === false, 'Selecting variation clears isEdited flag');
    assert(resetItem.currentDraft === resetItem.variations.concise, 'currentDraft restored to concise variation');
  }

  // --------------------------------------------------------------------------
  // SECTION 4: APPROVAL STATE MACHINE & ACTIONS (10 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 4] Approval State Machine & Transitions');
  {
    // Rejection flow
    const itemToReject = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_103',
      inboundMessageId: 'msg_reject_test',
      customerName: 'Samir Patel',
      customerEmail: 'samir@startup.co',
      subject: 'Refund request',
      latestCustomerMessage: 'I want a full refund for my setup fee.',
      intent: 'customer_support',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['refund'],
      whyApprovalRequired: ['Refunds require billing and management review.'],
      baseDraft: 'Hi Samir,\n\nWe are reviewing your refund request.\n\nBest regards,\nEvores',
    });

    const rejected = await rejectApprovalItem('company_evores_001', itemToReject.id, 'Customer is outside 30-day refund window');
    assert(rejected.status === 'REJECTED', 'Status transitioned to REJECTED');
    assert(rejected.rejectionReason === 'Customer is outside 30-day refund window', 'Rejection reason recorded');

    // Cannot edit or send rejected item
    let editRejectedFailed = false;
    try {
      await updateApprovalDraft('company_evores_001', itemToReject.id, 'New text');
    } catch {
      editRejectedFailed = true;
    }
    assert(editRejectedFailed, 'Cannot edit an already REJECTED approval item');

    const sendRejectedRes = await approveAndSendItem('company_evores_001', itemToReject.id, {
      provider: mockProvider,
    });
    assert(!sendRejectedRes.success, 'Cannot send a REJECTED approval item');

    // Approval & Send flow
    const itemToSend = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_104',
      gmailThreadId: 'thread_send_001',
      inboundMessageId: 'msg_send_test',
      customerName: 'Karan Mehra',
      customerEmail: 'karan@enterprise.com',
      subject: 'Custom SLA request',
      latestCustomerMessage: 'Can you commit to a 99.99% uptime SLA with penalties?',
      intent: 'project_request',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['custom_sla'],
      whyApprovalRequired: ['Custom SLAs require technical leadership review.'],
      baseDraft: 'Hi Karan,\n\nOur team is reviewing your uptime SLA requirements.\n\nBest regards,\nEvores',
    });

    const sendRes = await approveAndSendItem('company_evores_001', itemToSend.id, {
      userEmail: 'admin@evores.com',
      provider: mockProvider,
    });
    assert(sendRes.success === true, 'approveAndSendItem succeeded');
    assert(sendRes.item?.status === 'APPROVED', 'Item status transitioned to APPROVED');
    assert(sendRes.item?.approvedBy === 'admin@evores.com', 'ApprovedBy recorded');
    assert(Boolean(sendRes.item?.sentAt), 'sentAt timestamp recorded');

    // Duplicate send prevention
    const dupSendRes = await approveAndSendItem('company_evores_001', itemToSend.id, {
      provider: mockProvider,
    });
    assert(!dupSendRes.success, 'Duplicate send attempt is strictly prevented');
    assert(Boolean(dupSendRes.error?.includes('already been sent')), 'Error indicates already sent');
  }

  // --------------------------------------------------------------------------
  // SECTION 5: GMAIL SEND, THREAD CONTINUITY & QUOTA LIFECYCLE (10 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 5] Gmail Send, Thread Continuity & Quota Accounting');
  {
    const lastSent = mockProvider.sentEmails[mockProvider.sentEmails.length - 1];
    assert(lastSent.to === 'karan@enterprise.com', 'Sent email preserves customer recipient');
    assert(lastSent.inReplyTo === 'msg_send_test', 'Sent email preserves In-Reply-To header');
    assert(lastSent.metadata?.gmailThreadId === 'thread_send_001', 'Sent email preserves Gmail thread ID in metadata');
    assert(lastSent.subject.startsWith('Re:'), 'Subject is properly prefixed with Re:');
    assert(Boolean(lastSent.html), 'Sent email contains formatted HTML body');

    // Retry behavior on failed send
    mockProvider.shouldFail = true;
    const itemFailedSend = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_105',
      inboundMessageId: 'msg_fail_test',
      customerName: 'Priya Verma',
      customerEmail: 'priya@techco.in',
      subject: 'Timeline inquiry',
      latestCustomerMessage: 'Can you guarantee delivery by next Monday?',
      intent: 'project_request',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['delivery_deadline_guarantee'],
      whyApprovalRequired: ['Firm delivery deadlines require project scheduling review.'],
      baseDraft: 'Hi Priya,\n\nWe are reviewing our schedule for your timeline.\n\nBest regards,\nEvores',
    });

    const failedSendRes = await approveAndSendItem('company_evores_001', itemFailedSend.id, {
      provider: mockProvider,
    });
    assert(!failedSendRes.success, 'Send failed due to simulated network error');

    // Status remains PENDING on failure so it can be retried
    const itemAfterFail = await getApprovalItem('company_evores_001', itemFailedSend.id);
    assert(itemAfterFail?.status === 'PENDING', 'Item status remains PENDING on failure');

    // Retry with working provider
    mockProvider.shouldFail = false;
    const retryRes = await approveAndSendItem('company_evores_001', itemFailedSend.id, {
      provider: mockProvider,
    });
    assert(retryRes.success === true, 'Retry succeeds after network recovery');
    assert(retryRes.item?.status === 'APPROVED', 'Status transitions to APPROVED after retry');
    assert(Boolean(retryRes.outboundMessageId), 'Outbound message ID assigned after retry');
  }

  // --------------------------------------------------------------------------
  // SECTION 6: SECURITY & COMPANY ISOLATION (5 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 6] Security & Multi-Tenant Company Isolation');
  {
    // Create item for Company A
    const compAItem = await createApprovalItem({
      companyId: 'company_alpha_001',
      leadId: 'lead_alpha',
      inboundMessageId: 'msg_alpha_001',
      customerName: 'Alice',
      customerEmail: 'alice@corp.com',
      subject: 'Inquiry Alpha',
      latestCustomerMessage: 'Can we get 15% discount?',
      intent: 'pricing_request',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['discount'],
      whyApprovalRequired: ['Commercial discount'],
      baseDraft: 'Hi Alice, reviewing discount.',
    });

    // Company B attempts to access Company A's item
    const compBRead = await getApprovalItem('company_beta_002', compAItem.id);
    assert(compBRead === null, 'Company B cannot view Company A approval item (returns null)');

    let compBEditFailed = false;
    try {
      await updateApprovalDraft('company_beta_002', compAItem.id, 'Hacked text');
    } catch {
      compBEditFailed = true;
    }
    assert(compBEditFailed, 'Company B cannot edit Company A approval item');

    let compBRejectFailed = false;
    try {
      await rejectApprovalItem('company_beta_002', compAItem.id, 'Hacked rejection');
    } catch {
      compBRejectFailed = true;
    }
    assert(compBRejectFailed, 'Company B cannot reject Company A approval item');

    const compBSend = await approveAndSendItem('company_beta_002', compAItem.id, {
      provider: mockProvider,
    });
    assert(!compBSend.success, 'Company B cannot send Company A approval item');
    assert(Boolean(compBSend.error?.includes('unauthorized')), 'Send error indicates unauthorized access');
  }

  // --------------------------------------------------------------------------
  // SECTION 7: EXACT CRITICAL REGRESSION SCENARIO (16 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 7] Exact Critical Regression Scenario:');
  console.log('            "Actually, our budget has changed from ₹3 lakh to ₹80,000,');
  console.log('             and we want Evores to speak directly with the client.');
  console.log('             Can you confirm if the 15% commission, direct contact,');
  console.log('             and ₹80,000 budget are acceptable?"\n');
  {
    const history = [
      { sender: 'client' as const, text: 'Hi, we are looking for an agency partner for a web application. Project budget is ₹3 lakh.' },
      { sender: 'agent' as const, text: 'Thanks for reaching out to Evores! We would be glad to discuss your web application.' },
    ];

    const latestCustomerMsg =
      'Actually, our budget has changed from ₹3 lakh to ₹80,000, and we want Evores to speak directly with the client. ' +
      'Can you confirm if the 15% commission, direct contact, and ₹80,000 budget are acceptable?';

    // 1. Current-turn extraction & memory update
    const memory = buildStructuredConversationContext({
      history,
      latestMessage: latestCustomerMsg,
      companyContext: mockCompanyContext,
    });

    // 2. Permission & Risk Engine evaluation
    const permEval = evaluatePermissionAndRisk({
      messageText: latestCustomerMsg,
      history,
      structuredContext: memory,
      companyContext: mockCompanyContext,
      intent: 'partnership',
    });

    assert(permEval.decision === 'NEEDS_APPROVAL', '1. Permission Engine returns NEEDS_APPROVAL');
    assert(permEval.riskLevel === 'HIGH', '2. Risk level is HIGH');
    assert(permEval.restrictedTopics.includes('commission_revenue_share'), '3. 15% commission identified as restricted topic');
    assert(permEval.restrictedTopics.includes('client_communication_commitment'), '4. Direct client communication recognized as restricted');
    assert(memory.facts.budget === '₹80,000', '5. Current budget in memory is ₹80,000 (overrides ₹3 lakh)');
    assert(!permEval.reasons.some((r) => r.includes('₹3 lakh')), '6. Stale ₹3 lakh budget eliminated from decision reasons');
    assert(permEval.requiresCompanyApproval === true, '7. AI must NOT automatically approve these terms (requiresCompanyApproval is true)');

    // 8. Safe holding response
    assert(Boolean(permEval.customerHoldingResponse), '8. Customer receives safe holding response');
    const holding = permEval.customerHoldingResponse || '';
    assert(!holding.includes('AI') && !holding.includes('approval queue') && !holding.includes('risk engine'), '9. Holding response does not expose internal AI/approval mechanics');
    assert(holding.includes('₹80,000'), '10. Holding response acknowledges the updated ₹80,000 budget');
    assert(holding.includes('direct') || holding.includes('communicate'), '11. Holding response addresses direct client contact');
    assert(holding.includes('15%') && holding.includes('commission'), '12. Holding response addresses 15% commission');

    // 13. Create Approval Item
    const approvalItem = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_regression_001',
      gmailThreadId: 'thread_regression_123',
      inboundMessageId: 'msg_regression_inbound_001',
      customerName: 'Rohit Khandelwal',
      customerEmail: 'rohit@consultingpartners.com',
      subject: 'Updated Scope & Commercial Arrangement',
      latestCustomerMessage: latestCustomerMsg,
      intent: 'partnership',
      riskLevel: permEval.riskLevel,
      permissionDecision: permEval.decision,
      restrictedTopics: permEval.restrictedTopics,
      whyApprovalRequired: permEval.reasons,
      customerHoldingResponse: holding,
      holdingResponseSent: true,
      holdingOutboundMessageId: 'mock_holding_send_001',
      baseDraft: holding,
    });

    assert(approvalItem.status === 'PENDING', '13. Approval item appears in company queue with status PENDING');

    // 14. 3 distinct variations generated
    assert(Boolean(approvalItem.variations.professional), '14a. Professional variation generated');
    assert(Boolean(approvalItem.variations.relationship), '14b. Relationship-focused variation generated');
    assert(Boolean(approvalItem.variations.concise), '14c. Concise variation generated');

    // 15. Company selects Relationship variation and customizes
    await selectDraftVariation('company_evores_001', approvalItem.id, 'relationship');
    const customFinalDraft =
      'Hi Rohit,\n\n' +
      'Thanks so much for reaching out with these updates. We really appreciate your collaboration and have noted both ' +
      'the updated ₹80,000 budget and your request for our team to work directly with the client.\n\n' +
      'We have reviewed the proposed 15% commission and are happy to confirm this arrangement for the initial client project. ' +
      'Our team is ready to schedule the kickoff call with your client.\n\n' +
      'Best regards,\nEvores';

    await updateApprovalDraft('company_evores_001', approvalItem.id, customFinalDraft);
    const finalVal = validateEditedDraftText(customFinalDraft, latestCustomerMsg);
    assert(finalVal.isValid === true, '15. Final edited response validated with 0 issues');

    // 16. Approve & Send from FillFlow
    const finalSendRes = await approveAndSendItem('company_evores_001', approvalItem.id, {
      userEmail: 'leadership@evores.com',
      provider: mockProvider,
    });

    assert(finalSendRes.success === true, '16. Company can send approved email directly from FillFlow');
    assert(finalSendRes.item?.status === 'EDITED_AND_SENT', 'Status is EDITED_AND_SENT');

    const sentEmail = mockProvider.sentEmails[mockProvider.sentEmails.length - 1];
    assert(sentEmail.metadata?.gmailThreadId === 'thread_regression_123', 'Email remains in the original Gmail thread');
    assert(sentEmail.inReplyTo === 'msg_regression_inbound_001', 'In-Reply-To preserved');
    assert(sentEmail.text.includes('₹80,000'), 'Dispatched email contains ₹80,000 budget');
    assert(sentEmail.text.includes('15% commission'), 'Dispatched email contains 15% commission');

    // Duplicate send is impossible
    const dupTry = await approveAndSendItem('company_evores_001', approvalItem.id, {
      provider: mockProvider,
    });
    assert(!dupTry.success, 'Duplicate send of the regression scenario is strictly impossible');
  }

  // --------------------------------------------------------------------------
  // SECTION 8: PHASE 3 HUMAN-IN-THE-LOOP EXTENSIONS (14 Tests)
  // --------------------------------------------------------------------------
  console.log('\n[SECTION 8] Phase 3 Human-In-The-Loop Production Extensions');
  {
    // 1. Enriched Approval Item fields
    const phase3Item = await createApprovalItem({
      companyId: 'company_evores_001',
      leadId: 'lead_phase3_001',
      gmailThreadId: 'thread_phase3_xyz',
      inboundMessageId: 'msg_phase3_001',
      customerName: 'Ananya Deshmukh',
      customerEmail: 'ananya@growthcap.com',
      customerCompanyName: 'Growth Capital Partners',
      subject: 'Revised engagement scope',
      latestCustomerMessage: 'Can you confirm our ₹1.5 lakh budget and 10% referral fee?',
      conversationHistory: [
        { sender: 'client', text: 'Initial inquiry about growth consulting.' },
        { sender: 'agent', text: 'Hello Ananya, we would be pleased to assist.' },
      ],
      intent: 'partnership',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['referral_fee', 'budget_terms'],
      whyApprovalRequired: ['Referral fees and commercial budgets require leadership authorization.'],
      currentTurnRequirements: ['Confirm referral fee', 'Confirm ₹1.5 lakh budget'],
      commercialTermsDetected: ['referral_fee', 'budget_terms'],
      updatedOverrides: ['budget: ₹1.5 lakh', 'commission: 10%'],
      customerHoldingResponse: 'Thank you Ananya. We have noted your ₹1.5 lakh budget and 10% referral fee terms. We will verify with our leadership and respond shortly.',
      holdingResponseSent: true,
      baseDraft: 'Hi Ananya,\n\nWe have reviewed the ₹1.5 lakh budget and 10% referral fee.\n\nBest regards,\nEvores',
    });

    assert(phase3Item.customerCompanyName === 'Growth Capital Partners', 'Customer company name preserved');
    assert(phase3Item.conversationHistory?.length === 2, 'Conversation history preserved on approval item');
    assert(phase3Item.currentTurnRequirements?.length === 2, 'Current turn requirements preserved');
    assert(Boolean(phase3Item.updatedOverrides?.includes('budget: ₹1.5 lakh')), 'Updated overrides recorded');
    assert(Boolean(phase3Item.commercialTermsDetected?.includes('referral_fee')), 'Commercial terms detected recorded');

    // 2. Regenerate variation with safe deterministic constraints
    const regenRes = await regenerateApprovalDraft(
      'company_evores_001',
      phase3Item.id,
      'professional',
      'Make it warmer and more collaborative'
    );
    assert(regenRes.success === true, 'Regenerate draft variation succeeded');
    assert(Boolean(regenRes.newVersion), 'New version generated');
    assert(phase3Item.regeneratedVersions?.length === 1, 'Regenerated version tracked in version history');
    assert(phase3Item.regeneratedVersions?.[0]?.style === 'professional', 'Version history tracks variation style');

    // 3. Wording changes while numbers & facts are preserved
    const regenText = regenRes.newVersion || '';
    assert(regenText.includes('₹1.5 lakh'), 'Regenerated draft strictly preserves ₹1.5 lakh budget');
    assert(regenText.includes('10%'), 'Regenerated draft strictly preserves 10% fee');
    assert(phase3Item.variations.professional === regenText, 'Approval item professional variation updated to new version');

    // 4. Pre-send safety validation: Stale topics detection
    const staleVal = validateEditedDraftText(
      'Hi Ananya, our standard budget was ₹5 lakh previously.',
      phase3Item.latestCustomerMessage,
      { staleTopics: ['₹5 lakh', 'old budget'] }
    );
    assert(!staleVal.isValid, 'Pre-send validation rejects stale topics');
    assert(staleVal.issues.some((i) => i.includes('Stale topic detected')), 'Stale topic issue reported');

    // 5. Pre-send safety validation: Unapproved commitments (NDA / Guarantees)
    const dangerousVal = validateEditedDraftText(
      'Hi Ananya, we accept your NDA and guarantee 100% project delivery by Friday.',
      phase3Item.latestCustomerMessage
    );
    assert(!dangerousVal.isValid, 'Pre-send validation rejects unapproved NDA and guarantees');

    // 6. Direct send with regenerated text
    const sendRegenRes = await approveAndSendItem('company_evores_001', phase3Item.id, {
      userEmail: 'ceo@evores.com',
      provider: mockProvider,
    });
    assert(sendRegenRes.success === true, 'Direct send of regenerated response succeeded');
    assert(sendRegenRes.item?.status === 'APPROVED', 'Item status transitioned to APPROVED');
  }

  console.log('\n========================================================================');
  console.log(`  AI APPROVAL QUEUE TEST SUITE: ${passedCount} PASSED, 0 FAILED`);
  console.log('========================================================================\n');
}

runApprovalQueueTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
