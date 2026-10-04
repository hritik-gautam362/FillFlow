import { prisma } from '../src/lib/prisma';
import {
  parseCompanyInstruction,
  validateDraftAgainstCompanyInstruction,
} from '../src/lib/ai/companyInstructionParser';
import {
  generateDraftsFromCompanyInstruction,
  regenerateDraftVariation,
} from '../src/lib/ai/draftVariationEngine';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import {
  createApprovalItem,
  getApprovalItem,
  rejectApprovalItem,
  regenerateApprovalDraft,
  validateEditedDraftText,
  approveAndSendItem,
} from '../src/lib/services/aiApprovalService';
import {
  reserveEmailQuota,
  commitEmailQuota,
  releaseEmailQuota,
  getEmailQuota,
} from '../src/lib/services/emailQuotaService';
import { EmailProvider, SendEmailResult } from '../src/lib/services/email/EmailProvider';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import { getCompanyPermissionConfig } from '../src/lib/services/companyPermissionService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// Deterministic Mock Provider for Testing
class DeterministicMockProvider implements EmailProvider {
  name = 'deterministic-mock';
  shouldFail = false;
  sentEmails: Array<{ to: string; subject: string; body: string }> = [];

  isConfigured(): boolean {
    return true;
  }
  isSimulated(): boolean {
    return false;
  }
  verifyWebhook(): boolean {
    return true;
  }
  parseInboundMessage(payload: unknown): any {
    return payload as any;
  }
  normalizeMessage(text: string): string {
    return text;
  }
  parseDeliveryEvent(): any {
    return null;
  }
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: any
  ): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return { success: false, error: 'Simulated network drop' };
    }
    const mockId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push({ to, subject, body });
    return {
      success: true,
      providerMessageId: mockId,
    };
  }
  async sendMessage(params: any): Promise<SendEmailResult> {
    return this.sendEmail(params.to, params.subject, params.text || params.body || '', params);
  }
  async parseInboundWebhook(): Promise<any> {
    throw new Error('Not implemented');
  }
  async verifyWebhookSignature(): Promise<boolean> {
    return true;
  }
}

async function runRemediationTests() {
  console.log('========================================================================');
  console.log('       POST-ACCEPTANCE REMEDIATION PHASE DETERMINISTIC TEST SUITE       ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✓ Test ${total} PASSED: ${name}`);
    } catch (err: any) {
      console.error(`❌ Test ${total} FAILED: ${name}`);
      console.error(err);
      throw err;
    }
  }

  // Find or create test company
  const company = await prisma.company.findFirst({
    where: { name: 'Evores' },
  });
  assert(Boolean(company), 'Evores company must exist in DB');
  const companyId = company!.id;

  // Ensure connection is active and connected
  const conn = await prisma.automationConnection.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType: 'email',
      },
    },
    update: {
      status: 'connected',
    },
    create: {
      companyId,
      automationType: 'email',
      status: 'connected',
      displayName: 'evores.solutions@gmail.com',
      provider: 'google',
    },
  });

  await prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType: 'email',
      },
    },
    update: {
      enabled: true,
      quotaLocked: false,
      adminDisabled: false,
    },
    create: {
      companyId,
      automationType: 'email',
      enabled: true,
      quotaLocked: false,
      adminDisabled: false,
      monthlyLimit: 100,
      usedCredits: 0,
      reservedCredits: 0,
    },
  });

  const companyEmail = conn?.displayName || (conn?.metadata as any)?.googleEmail || 'evores.solutions@gmail.com';

  // ---------------------------------------------------------------------------
  // ISSUE 1: QUOTA ACCOUNTING INVARIANTS
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 1: ISSUE 1 — QUOTA ACCOUNTING INVARIANTS ---');

  // Helper to get quota snapshot
  async function getQuotaUsed(): Promise<number> {
    const q = await getEmailQuota(companyId);
    return q.usedCredits;
  }

  await test('1.1. Inbound message classified as approval + holding response = 0 credits consumed', async () => {
    const initialQuota = await getQuotaUsed();
    const mockProvider = new DeterministicMockProvider();

    // Process inbound message requiring approval (commercial partnership inquiry)
    const testMsgId = `test_inbound_holding_${Date.now()}`;
    const result = await processInboundEmail(
      {
        messageId: testMsgId,
        sender: 'partner.prospect@example.com',
        recipient: companyEmail,
        subject: 'Partnership Proposal',
        text: 'Hello Evores team, we would like to explore a partnership and propose a 30% revenue share.',
        timestamp: Date.now(),
        metadata: {
          gmailMessageId: testMsgId,
          gmailThreadId: `thread_${Date.now()}`,
        },
      },
      mockProvider
    );

    assert(result.success === true, 'Inbound processing should succeed');
    assert(result.approvalRequired === true, 'Inbound with commercial proposal must require approval');
    assert(result.holdingResponseSent === true, 'Holding response should be sent');

    const quotaAfterHolding = await getQuotaUsed();
    assert(
      quotaAfterHolding === initialQuota,
      `Holding response must consume 0 credits! Before: ${initialQuota}, After: ${quotaAfterHolding}`
    );
  });

  await test('1.2. Approval queue creation consumes 0 credits', async () => {
    const before = await getQuotaUsed();
    const testItemId = `approval_item_quota_test_${Date.now()}`;
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Commercial Terms',
      latestCustomerMessage: 'Can you offer a 20% discount?',
      intent: 'DISCOUNT_INQUIRY',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['discount'],
      whyApprovalRequired: ['Discount exceeds policy'],
      variations: {
        professional: 'Professional draft text',
        relationship: 'Relationship draft text',
        concise: 'Concise draft text',
      },
    });
    assert(Boolean(item), 'Item should be created');
    const after = await getQuotaUsed();
    assert(before === after, `Approval creation must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.3. Draft generation from company instruction consumes 0 credits', async () => {
    const before = await getQuotaUsed();
    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: 'We propose a 30% revenue share',
      instruction: 'We do not agree to 30% revenue share. Discuss terms first.',
    });
    assert(Boolean(drafts.professional), 'Drafts should be generated');
    const after = await getQuotaUsed();
    assert(before === after, `Draft generation must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.4. Draft regeneration consumes 0 credits', async () => {
    const before = await getQuotaUsed();
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_regen_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Partnership Terms',
      latestCustomerMessage: 'We propose a 30% revenue share',
      intent: 'PARTNERSHIP_PROPOSAL',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['revenue_share'],
      whyApprovalRequired: ['Revenue share requires review'],
      variations: {
        professional: 'Professional draft',
        relationship: 'Relationship draft',
        concise: 'Concise draft',
      },
    });

    const regenResult = await regenerateApprovalDraft(
      companyId,
      item.id,
      'professional',
      'We do not agree to 30% revenue share. Discuss commercial terms first.'
    );
    assert(regenResult.success === true, 'Regeneration should succeed');
    const after = await getQuotaUsed();
    assert(before === after, `Draft regeneration must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.5. Human editing and validation consume 0 credits', async () => {
    const before = await getQuotaUsed();
    const validation = validateEditedDraftText(
      'Hi,\n\nWe do not agree to the proposed terms. Let us connect to discuss.\n\nBest,\nEvores',
      'We propose a 30% revenue share'
    );
    assert(validation.isValid === true, 'Validation should pass');
    const after = await getQuotaUsed();
    assert(before === after, `Validation must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.6. Rejected approval consumes 0 credits', async () => {
    const before = await getQuotaUsed();
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_reject_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Inquiry',
      latestCustomerMessage: 'Can you guarantee 100% bug free?',
      intent: 'GUARANTEE_REQUEST',
      riskLevel: 'CRITICAL',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['guarantee'],
      whyApprovalRequired: ['Prohibited guarantee'],
      variations: {
        professional: 'Professional draft',
        relationship: 'Relationship draft',
        concise: 'Concise draft',
      },
    });

    const rejectRes = await rejectApprovalItem(companyId, item.id, 'Spam or unacceptable request');
    assert(rejectRes.status === 'REJECTED', 'Rejection status should be REJECTED');
    const after = await getQuotaUsed();
    assert(before === after, `Rejection must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.7. Failed Gmail send consumes 0 credits (releases reservation)', async () => {
    const before = await getQuotaUsed();
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_fail_send_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Inquiry',
      latestCustomerMessage: 'Can you send more info?',
      intent: 'SERVICE_INQUIRY',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: [],
      variations: {
        professional: 'Hi,\n\nHere is the requested information.\n\nBest,\nEvores',
        relationship: 'Relationship draft',
        concise: 'Concise draft',
      },
    });

    const failingProvider = new DeterministicMockProvider();
    failingProvider.shouldFail = true;

    const sendRes = await approveAndSendItem(companyId, item.id, {
      provider: failingProvider as any,
    });
    assert(sendRes.success === false, 'Send should fail');
    const after = await getQuotaUsed();
    assert(before === after, `Failed send must consume 0 credits! Before: ${before}, After: ${after}`);
  });

  await test('1.8. Successful final Gmail send consumes EXACTLY 1 credit', async () => {
    const before = await getQuotaUsed();
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_success_send_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Inquiry',
      latestCustomerMessage: 'Can you provide services in our region?',
      intent: 'SERVICE_INQUIRY',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: [],
      variations: {
        professional: 'Hi,\n\nWe would be glad to support your business in your region.\n\nBest,\nEvores',
        relationship: 'Relationship draft',
        concise: 'Concise draft',
      },
    });

    const successProvider = new DeterministicMockProvider();
    const sendRes = await approveAndSendItem(companyId, item.id, {
      provider: successProvider as any,
    });
    assert(sendRes.success === true, `Send should succeed, got error: ${sendRes.error}`);
    const after = await getQuotaUsed();
    assert(
      after === before + 1,
      `Successful final send must consume exactly 1 credit! Before: ${before}, After: ${after}`
    );
  });

  await test('1.9. Duplicate send dispatch consumes 0 additional credits', async () => {
    const before = await getQuotaUsed();
    const item = await createApprovalItem({
      companyId,
      leadId: 'lead_test_001',
      baseDraft: 'Base draft',
      inboundMessageId: `msg_dup_send_${Date.now()}`,
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      subject: 'Inquiry',
      latestCustomerMessage: 'Testing duplicate send protection',
      intent: 'SERVICE_INQUIRY',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: [],
      variations: {
        professional: 'Hi,\n\nFirst send.\n\nBest,\nEvores',
        relationship: 'Relationship draft',
        concise: 'Concise draft',
      },
    });

    const successProvider = new DeterministicMockProvider();
    const firstSend = await approveAndSendItem(companyId, item.id, {
      provider: successProvider as any,
    });
    assert(firstSend.success === true, 'First send should succeed');
    const afterFirst = await getQuotaUsed();
    assert(afterFirst === before + 1, 'First send consumes 1 credit');

    // Duplicate send on the same already-sent item
    const secondSend = await approveAndSendItem(companyId, item.id, {
      provider: successProvider as any,
    });
    assert(secondSend.success === false, 'Duplicate send must be blocked');
    const afterSecond = await getQuotaUsed();
    assert(afterSecond === afterFirst, 'Duplicate send must consume 0 additional credits');
  });

  // ---------------------------------------------------------------------------
  // ISSUE 2: COMPANY INSTRUCTIONS MUST BE AUTHORITATIVE
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: ISSUE 2 — COMPANY INSTRUCTIONS AUTHORITATIVE FIDELITY ---');

  // Scenario 1: "We do not agree to 30% revenue share."
  await test('2.1. "We do not agree to 30% revenue share." -> strictly preserves refusal across drafts', () => {
    const instruction = 'We are interested in the partnership, but do not agree to the proposed 30% revenue share. Tell them we would like to discuss the commercial terms and understand their expectations first.';
    const customerMsg = 'We would like to partner with Evores and propose a 30% revenue share.';
    
    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'REJECT', `Expected position REJECT, got: ${parsed.position}`);
    assert(parsed.mustPreserveRefusal === true, 'mustPreserveRefusal should be true');
    assert(parsed.prohibitedNumbers.includes('30%'), '30% must be prohibited');

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    // Verify none of the drafts contain the prohibited agreement
    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(
        !text.toLowerCase().includes('open to discussing a 30% revenue-share'),
        `${style} draft must NOT weaken refusal into tentative acceptance`
      );
      assert(
        !text.toLowerCase().includes('open to a 30% revenue-share'),
        `${style} draft must NOT be open to 30% revenue share`
      );
      assert(
        text.toLowerCase().includes('do not agree') || text.toLowerCase().includes("don't agree"),
        `${style} draft must explicitly preserve company refusal`
      );

      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `Validator should accept faithful draft for ${style}: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 2: "We reject the proposed 20% commission."
  await test('2.2. "We reject the proposed 20% commission." -> preserved faithfully', () => {
    const instruction = 'We reject the proposed 20% commission.';
    const customerMsg = 'Can you offer a 20% commission on referrals?';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'REJECT', `Expected REJECT, got ${parsed.position}`);
    assert(parsed.prohibitedNumbers.includes('20%'), '20% must be prohibited');

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(!text.toLowerCase().includes('can offer 20%'), `${style} must not offer 20%`);
      assert(!text.toLowerCase().includes('agree to 20%'), `${style} must not agree to 20%`);
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 3: "We can offer 10%, not 20%."
  await test('2.3. "We can offer 10%, not 20%." -> conditional counter-offer preserved', () => {
    const instruction = 'We can offer 10%, not 20%.';
    const customerMsg = 'We require a 20% commission.';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'CONDITIONAL', `Expected CONDITIONAL, got ${parsed.position}`);
    assert(parsed.counterOffer === '10%', `Expected counter-offer 10%, got ${parsed.counterOffer}`);
    assert(parsed.prohibitedNumbers.includes('20%'), '20% must be prohibited');

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(text.includes('10%'), `${style} must contain counter-offer 10%`);
      assert(text.includes('20%'), `${style} must reference and refuse 20%`);
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 4: "Do not promise delivery within 7 days."
  await test('2.4. "Do not promise delivery within 7 days." -> prohibition enforced', () => {
    const instruction = 'Do not promise delivery within 7 days.';
    const customerMsg = 'Can you deliver the completed project within 7 days?';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'PROHIBIT_MENTION' || parsed.position === 'REJECT', `Got ${parsed.position}`);

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(
        !text.toLowerCase().includes('promise delivery within 7 days'),
        `${style} must not promise delivery in 7 days`
      );
      assert(
        !text.toLowerCase().includes('guarantee delivery in 7 days'),
        `${style} must not guarantee delivery in 7 days`
      );
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 5: "We do not accept the exclusivity clause."
  await test('2.5. "We do not accept the exclusivity clause." -> non-exclusive preserved', () => {
    const instruction = 'We do not accept the exclusivity clause.';
    const customerMsg = 'We require an exclusive partnership in our territory.';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'REJECT', `Expected REJECT, got ${parsed.position}`);
    assert(parsed.topic === 'exclusivity', `Expected exclusivity, got ${parsed.topic}`);

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(!text.toLowerCase().includes('agree to exclusivity'), `${style} must not agree to exclusivity`);
      assert(
        text.toLowerCase().includes('do not accept') || text.toLowerCase().includes("aren't able to accept"),
        `${style} must state inability to accept exclusivity`
      );
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 6: "We can offer a 10% discount only."
  await test('2.6. "We can offer a 10% discount only." -> limit strictly respected', () => {
    const instruction = 'We can offer a 10% discount only.';
    const customerMsg = 'Could you give us a 25% discount?';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'CONDITIONAL', `Expected CONDITIONAL, got ${parsed.position}`);
    assert(parsed.counterOffer === '10%', `Expected 10%, got ${parsed.counterOffer}`);

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(text.includes('10%'), `${style} must include 10% discount`);
      assert(!text.includes('25%'), `${style} must not offer 25%`);
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 7: "Do not mention pricing yet."
  await test('2.7. "Do not mention pricing yet." -> prices prohibited from draft', () => {
    const instruction = 'Do not mention pricing yet.';
    const customerMsg = 'How much will this project cost?';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'PROHIBIT_MENTION', `Expected PROHIBIT_MENTION, got ${parsed.position}`);

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(!/(?:\$|₹|USD|INR)\s*\d+/i.test(text), `${style} must not mention numbers with currency`);
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenario 8: "We want to discuss the commercial terms first."
  await test('2.8. "We want to discuss the commercial terms first." -> discussion deferred', () => {
    const instruction = 'We want to discuss the commercial terms first.';
    const customerMsg = 'What are your commercial terms?';

    const parsed = parseCompanyInstruction(instruction);
    assert(parsed.position === 'DEFER_OR_DISCUSS', `Expected DEFER_OR_DISCUSS, got ${parsed.position}`);

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    for (const [style, text] of Object.entries({
      professional: drafts.professional,
      warm: drafts.warm,
      concise: drafts.concise,
    })) {
      assert(
        text.toLowerCase().includes('discuss') && text.toLowerCase().includes('commercial terms'),
        `${style} must include discussion of commercial terms`
      );
      const val = validateDraftAgainstCompanyInstruction(text, instruction);
      assert(val.isValid, `${style} validation failed: ${val.issues.join('; ')}`);
    }
  });

  // Scenarios 9-11: Professional, Warm, Concise all preserve company position
  await test('2.9-2.11. Professional, Warm, Concise all preserve explicit refusal position', () => {
    const instruction = 'We do not agree to 30% revenue share.';
    const customerMsg = 'We propose 30% revenue share.';

    const drafts = generateDraftsFromCompanyInstruction({
      customerMessage: customerMsg,
      instruction,
    });

    // 9. Professional
    assert(
      drafts.professional.toLowerCase().includes('do not agree to the proposed 30% revenue-share') ||
      drafts.professional.toLowerCase().includes('do not agree to the proposed 30% revenue share'),
      'Professional draft must preserve refusal'
    );
    // 10. Warm
    assert(
      drafts.warm.toLowerCase().includes("don't agree to the proposed 30% revenue") ||
      drafts.warm.toLowerCase().includes("aren't able to agree to the proposed 30% revenue") ||
      drafts.warm.toLowerCase().includes('do not agree to the proposed 30% revenue'),
      'Warm draft must preserve refusal'
    );
    // 11. Concise
    assert(
      drafts.concise.toLowerCase().includes('do not agree to the proposed 30% revenue share') ||
      drafts.concise.toLowerCase().includes('do not agree to the proposed 30% revenue-share'),
      'Concise draft must preserve refusal'
    );
  });

  // Scenario 12: Regenerated drafts preserve company position
  await test('2.12. Regenerated drafts preserve company position across all styles', () => {
    const instruction = 'We do not agree to 30% revenue share. Discuss commercial terms first.';
    const customerMsg = 'We propose a 30% revenue share.';

    for (const style of ['professional', 'relationship', 'warm', 'concise'] as const) {
      const regenerated = regenerateDraftVariation({
        style: style as any,
        instructions: instruction,
        customerMessage: customerMsg,
      });

      assert(
        !regenerated.toLowerCase().includes('open to discussing a 30% revenue-share'),
        `Regenerated ${style} must NOT open discussion of 30%`
      );
      assert(
        regenerated.toLowerCase().includes('do not agree') || regenerated.toLowerCase().includes("don't agree"),
        `Regenerated ${style} must preserve refusal`
      );
    }
  });

  // Scenario 13: Validator catches explicit contradiction
  await test('2.13. Validator catches explicit contradiction between company instruction and draft', () => {
    const instruction = 'We do not agree to 30% revenue share.';
    const contradictingDraft = 'Hi,\n\nWe are open to discussing a 30% revenue-share arrangement with your team.\n\nBest,\nEvores';

    const val = validateDraftAgainstCompanyInstruction(contradictingDraft, instruction);
    assert(!val.isValid, 'Validator MUST reject contradicting draft');
    assert(
      val.issues.some((i) => i.toLowerCase().includes('semantic conflict') || i.toLowerCase().includes('refuse')),
      `Expected semantic conflict issue, got: ${JSON.stringify(val.issues)}`
    );
  });

  // Scenario 14: Validator allows faithful paraphrasing
  await test('2.14. Validator allows faithful paraphrasing', () => {
    const instruction = 'We do not agree to 30% revenue share. Tell them we want to discuss commercial terms first.';
    const faithfulDraft = 'Hi,\n\nThank you for reaching out regarding the referral partnership. While we are excited to explore collaborating together, we do not agree to the proposed 30% revenue share. We would like to connect to discuss the commercial structure and understand your expectations before agreeing to specific terms.\n\nBest regards,\nEvores';

    const val = validateDraftAgainstCompanyInstruction(faithfulDraft, instruction);
    assert(val.isValid === true, `Faithful paraphrasing should be accepted! Got issues: ${JSON.stringify(val.issues)}`);
  });

  // Scenario 15: Customer's proposed number does NOT become company-approved knowledge
  await test('2.15. Customer\'s proposed number does NOT become company-approved knowledge', async () => {
    // When customer proposes 30% revenue share, check verified company knowledge
    const compBefore = (await prisma.company.findUnique({
      where: { id: companyId },
    })) as any;
    const pricingPolicy = compBefore?.pricingPolicy;

    // Simulate inbound message with 30% revenue share proposal
    const testMsgId = `unapproved_prop_${Date.now()}`;
    await processInboundEmail(
      {
        messageId: testMsgId,
        sender: 'prospect.unapproved@example.com',
        recipient: companyEmail,
        subject: 'Partnership',
        text: 'We propose a 45% commission on all client leads.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: testMsgId },
      },
      new DeterministicMockProvider()
    );

    // Verify company pricingPolicy and verified facts were NOT altered by customer proposal
    const compAfter = (await prisma.company.findUnique({
      where: { id: companyId },
    })) as any;
    assert(
      compAfter?.pricingPolicy === pricingPolicy,
      'Customer email proposal must never alter verified company pricingPolicy'
    );
    assert(
      !compAfter?.pricingPolicy?.includes('45%'),
      '45% commission from customer email must not become verified company knowledge'
    );
  });

  // Scenario 16: Customer emails NEVER automatically become verified company knowledge
  await test('2.16. Customer emails NEVER automatically create verified company knowledge entries', async () => {
    const configBefore = await getCompanyPermissionConfig(companyId);
    const knowledgeCountBefore = (configBefore.knowledge || []).length;

    const testMsgId = `knowledge_leak_test_${Date.now()}`;
    await processInboundEmail(
      {
        messageId: testMsgId,
        sender: 'random.customer@example.com',
        recipient: companyEmail,
        subject: 'Inquiry with facts',
        text: 'We want 50% discount and 99.999% SLA guarantee.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: testMsgId },
      },
      new DeterministicMockProvider()
    );

    const configAfter = await getCompanyPermissionConfig(companyId);
    const knowledgeCountAfter = (configAfter.knowledge || []).length;

    assert(
      knowledgeCountAfter === knowledgeCountBefore,
      `CompanyKnowledge entries must remain unchanged! Before: ${knowledgeCountBefore}, After: ${knowledgeCountAfter}`
    );
  });

  console.log('\n========================================================================');
  console.log(`  ALL ${passed} / ${total} REMEDIATION TESTS PASSED SUCCESSFULLY!          `);
  console.log('========================================================================\n');
}

runRemediationTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
