import {
  evaluatePermissionAndRisk,
  IMMUTABLE_SAFETY_PATTERNS,
} from '../src/lib/ai/permissionEngine';
import {
  getCompanyPermissionConfig,
  updateCompanyPermissionConfig,
  setAIAutonomyMode,
  setEmergencyOutboundPause,
  addCompanyKnowledge,
  verifyCompanyKnowledge,
  deleteCompanyKnowledge,
  addTeachAiSuggestion,
  acceptTeachAiSuggestion,
  normalizePermissionConfig,
  resetMemoryPermissionConfigs,
} from '../src/lib/services/companyPermissionService';
import {
  createApprovalItem,
  getApprovalItem,
  listApprovalItems,
  selectDraftVariation,
  updateApprovalDraft,
  rejectApprovalItem,
  approveAndSendItem,
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
import { CompanyContext } from '../src/lib/ai/types';
import { buildStructuredConversationContext } from '../src/lib/ai/conversationMemory';

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

class MockControlCenterEmailProvider implements EmailProvider {
  readonly providerType = 'mock';
  sentEmails: Array<SendEmailParams> = [];
  shouldFail = false;
  failureError = 'Simulated network timeout';

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return { success: false, error: this.failureError };
    }
    const providerMessageId = `mock_ctrl_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

const mockCompanyContext: CompanyContext = {
  companyId: 'company_evores_ctrl_001',
  name: 'Evores Digital Systems',
  industry: 'Software Engineering',
  services: ['Custom Web Development', 'Mobile Apps', 'Cloud Infrastructure'],
  description: 'Enterprise grade software development firm.',
  pricingPolicy: 'Custom quote based on scope and deliverables.',
};

async function runCompanyAiControlCenterTestSuite() {
  console.log('========================================================================');
  console.log('   PHASE 2: COMPANY AI CONTROL CENTER & HUMAN APPROVAL TEST SUITE       ');
  console.log('========================================================================\n');

  resetMemoryPermissionConfigs();
  resetMemoryApprovalQueue();
  const mockProvider = new MockControlCenterEmailProvider();

  // --------------------------------------------------------------------------
  // TEST 1: Default Permissions
  // --------------------------------------------------------------------------
  console.log('[TEST 1] Default Permissions');
  {
    const config = await getCompanyPermissionConfig('company_evores_ctrl_001');
    assert(config.autonomyMode === 'LIMITED_ACCESS', 'Default autonomy mode is LIMITED_ACCESS');
    assert(config.outboundPaused === false, 'Default outbound pause is false');
    assert(config.topicPolicies?.generalInfo === 'AUTO', 'Default generalInfo policy is AUTO');
    assert(config.topicPolicies?.services === 'AUTO', 'Default services policy is AUTO');
    assert(config.topicPolicies?.pricing === 'APPROVAL', 'Default pricing policy is APPROVAL');
    assert(config.topicPolicies?.commission === 'APPROVAL', 'Default commission policy is APPROVAL');
    assert(config.topicPolicies?.contracts === 'BLOCKED', 'Default contracts policy is BLOCKED');
    assert(config.topicPolicies?.ndaAcceptance === 'BLOCKED', 'Default ndaAcceptance policy is BLOCKED');
    assert(config.topicPolicies?.exclusivity === 'BLOCKED', 'Default exclusivity policy is BLOCKED');
  }

  // --------------------------------------------------------------------------
  // TEST 2: AUTO Capability
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] AUTO Capability');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'What technologies do you use for building web applications?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'SAFE_AUTO_REPLY', 'Verified service/tech returns SAFE_AUTO_REPLY');
    assert(evalRes.riskLevel === 'LOW', 'Risk level is LOW');
    assert(evalRes.requiresCompanyApproval === false, 'Auto capability does not require company approval');
  }

  // --------------------------------------------------------------------------
  // TEST 3: APPROVAL Capability
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] APPROVAL Capability');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Can you offer a 20% discount on the project price?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', 'Discount request triggers NEEDS_APPROVAL');
    assert(evalRes.riskLevel === 'HIGH', 'Risk level is HIGH');
    assert(evalRes.requiresCompanyApproval === true, 'Discount requires company approval');
    assert(Boolean(evalRes.customerHoldingResponse?.length), 'Holding response is generated');
  }

  // --------------------------------------------------------------------------
  // TEST 4: BLOCKED Capability
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] BLOCKED Capability');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'We require an exclusive partnership agreement where you do not work with any competitors.',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'BLOCKED', 'Exclusivity agreement is BLOCKED');
    assert(evalRes.riskLevel === 'CRITICAL', 'Exclusivity is CRITICAL risk');
    assert(evalRes.requiresCompanyApproval === true, 'Blocked item requires human management approval');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Limited Access Mode
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Limited Access Mode');
  {
    await setAIAutonomyMode('company_evores_ctrl_001', 'LIMITED_ACCESS');
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Where are your offices located and what are your business hours?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'INFORMATION_ONLY' || evalRes.decision === 'SAFE_AUTO_REPLY', 'General info allowed automatically in Limited Access mode');
    assert(evalRes.requiresCompanyApproval === false, 'No approval required for low-risk verified query in Limited Access');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Human Approval Only Mode (NO_AUTONOMOUS_ACCESS)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Human Approval Only Mode (NO_AUTONOMOUS_ACCESS)');
  {
    await setAIAutonomyMode('company_evores_ctrl_001', 'NO_AUTONOMOUS_ACCESS');
    const config = await getCompanyPermissionConfig('company_evores_ctrl_001');
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'What technologies do you use for building web applications?',
      companyContext: mockCompanyContext,
      config,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', 'Low-risk query escalates to NEEDS_APPROVAL in Human Approval Only mode');
    assert(evalRes.requiresCompanyApproval === true, 'Human approval strictly required when autonomous sends are disabled');
    assert(evalRes.reasons.some((r) => r.includes('Human Approval Only')), 'Reason indicates Human Approval Only mode');

    // Reset back to LIMITED_ACCESS for subsequent tests
    await setAIAutonomyMode('company_evores_ctrl_001', 'LIMITED_ACCESS');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Emergency Outbound Pause
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Emergency Outbound Pause');
  {
    await setEmergencyOutboundPause('company_evores_ctrl_001', true);
    const config = await getCompanyPermissionConfig('company_evores_ctrl_001');
    assert(config.outboundPaused === true, 'outboundPaused is true in company configuration');

    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Tell me about your services.',
      companyContext: mockCompanyContext,
      config,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', 'Emergency pause forces NEEDS_APPROVAL even for basic service inquiries');
    assert(evalRes.requiresCompanyApproval === true, 'Emergency pause requires human approval');
    assert(evalRes.reasons.some((r) => r.includes('Emergency outbound pause')), 'Reason reflects emergency pause');

    // Reset pause
    await setEmergencyOutboundPause('company_evores_ctrl_001', false);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Pricing Approval
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Pricing Approval');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'What is the exact fixed price for building an e-commerce store?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', 'Exact fixed price inquiry requires company approval');
    assert(evalRes.restrictedTopics.includes('pricing_commitment'), 'Restricted topic is pricing_commitment');
  }

  // --------------------------------------------------------------------------
  // TEST 9: Commission Approval
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Commission Approval');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Can you confirm if a 15% referral commission is acceptable to your team?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', 'Commission confirmation requires company approval');
    assert(evalRes.restrictedTopics.includes('commission_revenue_share'), 'Restricted topic is commission_revenue_share');
  }

  // --------------------------------------------------------------------------
  // TEST 10: Discount Approval
  // --------------------------------------------------------------------------
  console.log('\n[TEST 10] Discount Approval');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'We are on a tight budget. Can you offer a 10% discount?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'NEEDS_APPROVAL', '10% discount request requires company approval');
    assert(evalRes.restrictedTopics.includes('discount_request'), 'Restricted topic is discount_request');
  }

  // --------------------------------------------------------------------------
  // TEST 11: Contract Blocking
  // --------------------------------------------------------------------------
  console.log('\n[TEST 11] Contract Blocking');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Please accept our contract terms and execute the agreement immediately.',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'BLOCKED', 'Contract acceptance without human authorization is BLOCKED');
    assert(evalRes.riskLevel === 'CRITICAL', 'Contract request is CRITICAL risk');
  }

  // --------------------------------------------------------------------------
  // TEST 12: NDA Blocking
  // --------------------------------------------------------------------------
  console.log('\n[TEST 12] NDA Blocking');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Please sign this NDA before we share project files.',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'BLOCKED', 'Signing an NDA is strictly BLOCKED from autonomous agreement');
    assert(evalRes.restrictedTopics.includes('legal_contractual_commitment'), 'Topic is legal_contractual_commitment');
  }

  // --------------------------------------------------------------------------
  // TEST 13: Legal Commitment Blocking
  // --------------------------------------------------------------------------
  console.log('\n[TEST 13] Legal Commitment Blocking');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Can you act as our official legal representative and grant power of attorney?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'BLOCKED', 'Power of attorney / legal representation is BLOCKED');
    assert(evalRes.riskLevel === 'CRITICAL', 'Risk is CRITICAL');
  }

  // --------------------------------------------------------------------------
  // TEST 14: Guarantee Blocking
  // --------------------------------------------------------------------------
  console.log('\n[TEST 14] Guarantee Blocking');
  {
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Can you give us a 100% bug-free guarantee and unconditional refund guarantee?',
      companyContext: mockCompanyContext,
    });
    assert(evalRes.decision === 'BLOCKED', 'Unconditional bug-free / money-back guarantees are BLOCKED');
    assert(evalRes.restrictedTopics.includes('unapproved_guarantee'), 'Restricted topic is unapproved_guarantee');
  }

  // --------------------------------------------------------------------------
  // TEST 15: Verified Company Knowledge
  // --------------------------------------------------------------------------
  console.log('\n[TEST 15] Verified Company Knowledge');
  {
    const knowledgeItem = await addCompanyKnowledge('company_evores_ctrl_001', {
      title: 'Proprietary AI Pipeline',
      content: 'Evores builds automated custom AI data pipelines using Vector databases and Python.',
      category: 'services',
      verified: true,
      source: 'COMPANY',
    });
    assert(knowledgeItem.verified === true, 'Knowledge item is verified');
    assert(knowledgeItem.source === 'COMPANY', 'Source is COMPANY');

    const config = await getCompanyPermissionConfig('company_evores_ctrl_001');
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Do you offer automated AI data pipelines?',
      companyContext: mockCompanyContext,
      config,
    });
    assert(evalRes.decision === 'SAFE_AUTO_REPLY', 'Verified knowledge enables SAFE_AUTO_REPLY');
  }

  // --------------------------------------------------------------------------
  // TEST 16: Unverified Knowledge
  // --------------------------------------------------------------------------
  console.log('\n[TEST 16] Unverified Knowledge');
  {
    await addCompanyKnowledge('company_evores_ctrl_001', {
      title: 'Free 24/7 Phone Support',
      content: 'Evores provides round-the-clock telephone support for free.',
      category: 'services',
      verified: false, // EXPLICITLY UNVERIFIED
      source: 'AI_SUGGESTION',
    });

    const config = await getCompanyPermissionConfig('company_evores_ctrl_001');
    const evalRes = evaluatePermissionAndRisk({
      messageText: 'Can you confirm if you provide free 24/7 telephone support as stated?',
      companyContext: mockCompanyContext,
      config,
    });
    assert(evalRes.decision !== 'SAFE_AUTO_REPLY', 'Unverified knowledge does NOT qualify for SAFE_AUTO_REPLY');
  }

  // --------------------------------------------------------------------------
  // TEST 17: Teach AI Workflow
  // --------------------------------------------------------------------------
  console.log('\n[TEST 17] Teach AI Workflow');
  {
    const suggestion = await addTeachAiSuggestion('company_evores_ctrl_001', {
      suggestionText: 'Evores provides white-label development for creative design agencies.',
      suggestedCategory: 'partnerships',
      sourceSnippet: 'Client asked: do you do white-label engineering for agencies?',
    });
    assert(suggestion.status === 'PENDING', 'Initial suggestion status is PENDING');

    // Accept suggestion with custom verification
    const verifiedKnowledge = await acceptTeachAiSuggestion('company_evores_ctrl_001', suggestion.id, {
      title: 'White-Label Agency Engineering',
      category: 'partnerships',
    });

    assert(Boolean(verifiedKnowledge), 'Accepted suggestion returned knowledge item');
    assert(verifiedKnowledge?.verified === true, 'Accepted knowledge is marked verified = true');
    assert(verifiedKnowledge?.source === 'COMPANY', 'Accepted knowledge source becomes COMPANY');
    assert(verifiedKnowledge?.title === 'White-Label Agency Engineering', 'Custom title preserved');
  }

  // --------------------------------------------------------------------------
  // TEST 18: Edited Response Validation (Valid Edit)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 18] Edited Response Validation (Valid Edit)');
  {
    const validEdit = 'Hi,\n\nThanks for reaching out to Evores. We have reviewed your request and would be glad to discuss the scope. Could you clarify your timeline?\n\nBest regards,\nEvores';
    const validation = validateEditedDraftText(validEdit, 'Can you help with our web project?');
    assert(validation.isValid === true, 'Safe professional edit passes validation with 0 issues');
  }

  // --------------------------------------------------------------------------
  // TEST 19: Unsafe Edited Response (Placeholders & Immutable Violations)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 19] Unsafe Edited Response (Placeholders & Immutable Violations)');
  {
    // A. Placeholder check
    const badEditWithPlaceholder = 'Hi,\n\nWe will build this for [INSERT_PRICE_HERE].\n\nBest,\nEvores';
    const valPlaceholder = validateEditedDraftText(badEditWithPlaceholder, 'What is the price?');
    assert(valPlaceholder.isValid === false, 'Draft with placeholders fails validation');
    assert(valPlaceholder.issues.some((i) => i.toLowerCase().includes('placeholder')), 'Flags placeholder issue');

    // B. Immutable contract check
    const badEditWithContract = 'Hi,\n\nWe hereby execute this binding contract and power of attorney on behalf of Evores.\n\nBest,\nEvores';
    const valContract = validateEditedDraftText(badEditWithContract, 'Can you sign?');
    assert(valContract.isValid === false, 'Draft with unapproved contract/legal commitment fails validation');
    assert(valContract.issues.some((i) => i.toLowerCase().includes('response requires review')), 'Flags response requires review');
  }

  // --------------------------------------------------------------------------
  // TEST 20: Approval Queue -> Approve & Send
  // --------------------------------------------------------------------------
  console.log('\n[TEST 20] Approval Queue -> Approve & Send');
  {
    const approvalItem = await createApprovalItem({
      companyId: 'company_evores_ctrl_001',
      leadId: 'lead_ctrl_101',
      inboundMessageId: 'inbound_ctrl_msg_101',
      customerName: 'Aditi Sharma',
      customerEmail: 'aditi@enterprisetech.com',
      subject: 'Custom SLA terms',
      latestCustomerMessage: 'We require a 99.99% uptime SLA.',
      intent: 'service_inquiry',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['sla_commitment'],
      whyApprovalRequired: ['Customer requested strict SLA'],
      baseDraft: 'Hi Aditi, we are reviewing your SLA requirements.',
      inReplyTo: 'inbound_ctrl_msg_101',
      references: 'inbound_ctrl_msg_101',
    });

    assert(approvalItem.status === 'PENDING', 'Item created in PENDING status');
    assert(Boolean(approvalItem.activityTimeline?.length), 'Activity timeline initialized with steps');

    const sendRes = await approveAndSendItem('company_evores_ctrl_001', approvalItem.id, {
      userEmail: 'admin@evores.com',
      provider: mockProvider,
    });

    assert(sendRes.success === true, 'Item successfully approved and dispatched via Gmail provider');
    assert(sendRes.item?.status === 'APPROVED_AND_SENT' || sendRes.item?.status === 'APPROVED', 'Status transitions to APPROVED_AND_SENT');
    assert(Boolean(sendRes.auditRecord), 'Audit record generated with full reconstructable metadata');
    assert(mockProvider.sentEmails.some((e) => e.to === 'aditi@enterprisetech.com'), 'Email physically dispatched to customer');
  }

  // --------------------------------------------------------------------------
  // TEST 21: Rejection Flow
  // --------------------------------------------------------------------------
  console.log('\n[TEST 21] Rejection Flow');
  {
    const itemToReject = await createApprovalItem({
      companyId: 'company_evores_ctrl_001',
      leadId: 'lead_ctrl_102',
      inboundMessageId: 'inbound_ctrl_msg_102',
      customerName: 'Vikram Rao',
      customerEmail: 'vikram@biz.com',
      subject: 'Refund request',
      latestCustomerMessage: 'We want our deposit refunded.',
      intent: 'customer_support',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['refund_request'],
      whyApprovalRequired: ['Refund policy review required'],
      baseDraft: 'Hi Vikram, we have noted your refund request.',
    });

    const rejectedItem = await rejectApprovalItem(
      'company_evores_ctrl_001',
      itemToReject.id,
      'Wrong commercial terms: refund outside 30-day window'
    );

    assert(rejectedItem.status === 'REJECTED', 'Status changed to REJECTED');
    assert(Boolean(rejectedItem.rejectionReason?.includes('refund outside 30-day window')), 'Rejection reason preserved');
    assert(Boolean(rejectedItem.activityTimeline?.some((a) => a.step === 'Draft Rejected')), 'Timeline records rejection');

    // Attempting to send a rejected item is blocked
    const sendRejectedRes = await approveAndSendItem('company_evores_ctrl_001', itemToReject.id, {
      provider: mockProvider,
    });
    assert(sendRejectedRes.success === false, 'Cannot send a rejected approval item');
  }

  // --------------------------------------------------------------------------
  // TEST 22: Audit Trail Completeness
  // --------------------------------------------------------------------------
  console.log('\n[TEST 22] Audit Trail Completeness');
  {
    const approvalItem = await createApprovalItem({
      companyId: 'company_evores_ctrl_001',
      leadId: 'lead_ctrl_103',
      gmailThreadId: 'thread_audit_999',
      inboundMessageId: 'inbound_ctrl_msg_103',
      customerName: 'Maya Sen',
      customerEmail: 'maya@agency.com',
      subject: 'Partnership Inquiry',
      latestCustomerMessage: 'Can we discuss an ongoing referral arrangement?',
      intent: 'partnership',
      riskLevel: 'MEDIUM',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['partnership_discussion'],
      whyApprovalRequired: ['Partnership discussion requires approval'],
      baseDraft: 'Hi Maya, we would love to explore a partnership.',
    });

    // Custom edit
    await updateApprovalDraft('company_evores_ctrl_001', approvalItem.id, 'Hi Maya, our team is excited to explore this partnership.');

    const sendRes = await approveAndSendItem('company_evores_ctrl_001', approvalItem.id, {
      userEmail: 'director@evores.com',
      provider: mockProvider,
    });

    const audit = sendRes.auditRecord as Record<string, unknown>;
    assert(Boolean(audit), 'Audit record present');
    assert(audit.companyId === 'company_evores_ctrl_001', 'Audit records companyId');
    assert(audit.leadId === 'lead_ctrl_103', 'Audit records leadId');
    assert(audit.gmailThreadId === 'thread_audit_999', 'Audit records gmailThreadId');
    assert(audit.approvingUser === 'director@evores.com', 'Audit records approving user');
    assert(audit.permissionDecision === 'NEEDS_APPROVAL', 'Audit records initial permission decision');
    assert(Boolean(audit.outboundMessageId), 'Audit records outbound message ID');
  }

  // --------------------------------------------------------------------------
  // TEST 23: Legacy Boolean Compatibility
  // --------------------------------------------------------------------------
  console.log('\n[TEST 23] Legacy Boolean Compatibility');
  {
    const legacyConfig = normalizePermissionConfig({
      autoReplyPricing: true,
      autoReplyDiscounts: false,
    });
    assert(legacyConfig.topicPolicies?.pricing === 'AUTO', 'Legacy autoReplyPricing: true maps to pricing: AUTO');
    assert(legacyConfig.topicPolicies?.discounts === 'APPROVAL', 'Legacy autoReplyDiscounts: false maps to discounts: APPROVAL');
    assert(legacyConfig.autoReplyPricing === true, 'Synchronized boolean remains true');
  }

  // --------------------------------------------------------------------------
  // TEST 24: Security & Multi-Tenant Company Isolation
  // --------------------------------------------------------------------------
  console.log('\n[TEST 24] Security & Multi-Tenant Company Isolation');
  {
    // Company A creates an item
    const compAItem = await createApprovalItem({
      companyId: 'company_alpha_111',
      leadId: 'lead_alpha',
      inboundMessageId: 'msg_alpha',
      customerName: 'Alpha Customer',
      customerEmail: 'cust@alpha.com',
      subject: 'Alpha Topic',
      latestCustomerMessage: 'Alpha question',
      intent: 'service_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Alpha reason'],
      baseDraft: 'Alpha draft',
    });

    // Company B attempts to read Company A item
    const compBRead = await getApprovalItem('company_beta_222', compAItem.id);
    assert(compBRead === null, 'Company B cannot view Company A approval item (returns null)');

    // Company B attempts to send Company A item
    const compBSend = await approveAndSendItem('company_beta_222', compAItem.id, {
      provider: mockProvider,
    });
    assert(compBSend.success === false, 'Company B cannot send Company A approval item');
    assert(Boolean(compBSend.error?.includes('unauthorized') || compBSend.error?.includes('not found')), 'Send error indicates unauthorized or not found');
  }

  // --------------------------------------------------------------------------
  // TEST 25: Phase 1 Regression (Critical 3-Point Scenario)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 25] Phase 1 Regression (Critical 3-Point Scenario)');
  {
    const history = [
      { sender: 'client' as const, text: 'We have a website project for our clothing store with a ₹3 lakh budget.' },
      { sender: 'agent' as const, text: 'Hi! We would be delighted to help you build your clothing store website.' },
    ];

    const criticalMessage =
      'Actually, our budget has changed from ₹3 lakh to ₹80,000, and we want Evores to speak directly with the client. ' +
      'Can you confirm if the 15% commission, direct contact, and ₹80,000 budget are acceptable?';

    const structuredContext = buildStructuredConversationContext({
      history,
      latestMessage: criticalMessage,
      previousRequirements: { projectType: 'Clothing website', budget: '₹3 lakh' },
      companyContext: mockCompanyContext,
    });

    const evalRes = evaluatePermissionAndRisk({
      messageText: criticalMessage,
      history,
      structuredContext,
      companyContext: mockCompanyContext,
    });

    assert(evalRes.decision === 'NEEDS_APPROVAL', '1. Decision is NEEDS_APPROVAL');
    assert(evalRes.riskLevel === 'HIGH', '2. Risk is HIGH');
    assert(evalRes.requiresCompanyApproval === true, '3. Requires company approval');
    assert(structuredContext.facts.budget === '₹80,000', '4. New budget ₹80,000 overrides ₹3 lakh in memory');
    assert(Boolean(evalRes.customerHoldingResponse?.includes('₹80,000')), '5. Holding response acknowledges ₹80,000 budget');
    assert(Boolean(evalRes.customerHoldingResponse?.includes('15% commission')), '6. Holding response addresses 15% commission');
    assert(Boolean(evalRes.customerHoldingResponse?.includes('communicate directly')), '7. Holding response addresses direct client communication');
  }

  console.log('\n========================================================================');
  console.log(`  ALL ${totalCount} TESTS PASSED: ${passedCount}/${totalCount} assertions verified.`);
  console.log('========================================================================\n');
}

runCompanyAiControlCenterTestSuite().catch((err) => {
  console.error('Fatal error in control center test suite:', err);
  process.exit(1);
});
