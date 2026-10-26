import { prisma } from '../src/lib/prisma';
import { EmailProvider, SendEmailResult } from '../src/lib/services/email/EmailProvider';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import {
  createApprovalItem,
  getApprovalItem,
  approveAndSendItem,
  listApprovalItems,
} from '../src/lib/services/aiApprovalService';
import { buildStructuredConversationContext } from '../src/lib/ai/conversationMemory';
import { evaluatePermissionAndRisk } from '../src/lib/ai/permissionEngine';
import { generateDraftVariations } from '../src/lib/ai/draftVariationEngine';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { callGeminiRequirementAgent } from '../src/lib/ai/gemini';
import { CompanyContext } from '../src/lib/ai/types';
import { updateCompanyPermissionConfig } from '../src/lib/services/companyPermissionService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

class DeterministicMockProvider implements EmailProvider {
  name = 'deterministic-mock';
  sentEmails: Array<{ to: string; subject: string; body: string; metadata?: Record<string, unknown> }> = [];

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
    const mockId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentEmails.push({ to, subject, body, metadata: options?.metadata });
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

async function runRegressionTestSuite() {
  console.log('========================================================================');
  console.log('    FILLFLOW SPECIFICITY & ROOT CAUSE FIX REGRESSION TEST SUITE        ');
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

  // Setup company context for testing
  let company = await prisma.company.findFirst({
    where: { name: 'Evores' },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Evores',
        industry: 'Software Development',
      },
    });
  }

  const companyContext: CompanyContext = {
    companyId: company.id,
    name: 'Evores',
    industry: 'Software Development',
    services: ['Web Development', 'Mobile Apps', 'E-commerce Solutions', 'Custom Software'],
    description: 'Evores is a premier digital engineering and software development agency.',
  };

  // Ensure AutomationConnection exists
  await prisma.automationConnection.upsert({
    where: {
      companyId_automationType: {
        companyId: company.id,
        automationType: 'email',
      },
    },
    create: {
      companyId: company.id,
      automationType: 'email',
      provider: 'google',
      status: 'connected',
      displayName: 'hello@evores.com',
      metadata: { googleEmail: 'hello@evores.com' },
    },
    update: {
      provider: 'google',
      status: 'connected',
      displayName: 'hello@evores.com',
      metadata: { googleEmail: 'hello@evores.com' },
    },
  });

  await prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId: company.id,
        automationType: 'email',
      },
    },
    create: {
      companyId: company.id,
      automationType: 'email',
      enabled: true,
      monthlyLimit: 1000,
      usedCredits: 0,
      reservedCredits: 0,
      quotaLocked: false,
      adminDisabled: false,
    },
    update: {
      enabled: true,
      quotaLocked: false,
      adminDisabled: false,
    },
  });

  // --------------------------------------------------------------------------
  // TEST CASE A: Website Development Inquiry (with Budget & Timeline)
  // --------------------------------------------------------------------------
  console.log('\n--- CASE A: COMPLETE WEBSITE INQUIRY WITH BUDGET & TIMELINE ---');
  const emailABody = `Hi Evores team,

We are looking to develop a responsive business website for our company.
The project should include:
- Homepage, service pages, contact form, testimonials, and an admin dashboard
- Target audience: small and medium-sized businesses
- Budget: ₹1,50,000–₹2,00,000
- Timeline: 6–8 weeks

Could you let us know how we can proceed?`;

  await test('A.1: Memory extracts exact budget, timeline, and features without corruption', async () => {
    const memA = buildStructuredConversationContext({
      history: [],
      latestMessage: emailABody,
      companyContext,
      currentIntent: 'service_inquiry',
      subject: 'Website Development Inquiry',
    });

    assert(memA.facts.timeline === '6–8 weeks', `Timeline should be "6–8 weeks", got "${memA.facts.timeline}"`);
    assert(Boolean(memA.facts.budget?.includes('1,50,000')), `Budget should contain 1,50,000, got "${memA.facts.budget}"`);
    assert(memA.facts.features.length >= 3, `Features should include at least 3 features, got ${memA.facts.features.length}`);
    assert(memA.facts.features.some((f) => f.toLowerCase().includes('admin dashboard') || f.toLowerCase().includes('dashboard')), 'Features must include admin dashboard');
  });

  await test('A.2: Permission Engine does not misclassify timeline preference as binding delivery guarantee', async () => {
    const memA = buildStructuredConversationContext({
      history: [],
      latestMessage: emailABody,
      companyContext,
      currentIntent: 'service_inquiry',
      subject: 'Website Development Inquiry',
    });

    const permA = evaluatePermissionAndRisk({
      messageText: emailABody,
      companyContext,
      structuredContext: memA,
      intent: 'service_inquiry',
    });

    // It should NOT flag delivery_deadline_guarantee because the customer did not demand a guarantee/penalty
    assert(
      !permA.restrictedTopics.includes('delivery_deadline_guarantee'),
      'Timeline preference should NOT be classified as delivery_deadline_guarantee'
    );
    assert(
      !permA.customerHoldingResponse ||
        !permA.customerHoldingResponse.includes('guaranteed delivery date'),
      'Holding response must NOT claim a delivery guarantee was requested'
    );
  });

  await test('A.3: Draft variations preserve baseDraft and do not overwrite with canned timeline boilerplate', async () => {
    const baseDraftA =
      'Hi there,\n\nThanks for reaching out to Evores. We would be glad to help you build a responsive business website featuring a homepage, service pages, contact form, testimonials, and a custom admin dashboard.\n\nYour budget of ₹1,50,000–₹2,00,000 and the 6–8 week timeline align well with our capabilities for developing professional web solutions for growing businesses. To get started, we can schedule an initial scoping call to review your design preferences and technical requirements in detail. Would you be available for a brief discussion this week?\n\nBest regards,\nEvores';

    const variationsA = generateDraftVariations({
      messageText: emailABody,
      baseDraft: baseDraftA,
      companyContext,
      restrictedTopics: ['delivery_timelines'],
    });

    assert(
      variationsA.professional.includes('₹1,50,000') || variationsA.professional.includes('admin dashboard'),
      'Professional variation must preserve baseDraft specifics (budget or features)'
    );
    assert(
      !variationsA.professional.includes('commit to a guaranteed delivery date'),
      'Must NOT overwrite baseDraft with canned guarantee template'
    );
    assert(
      variationsA.relationship.includes('admin dashboard') || variationsA.relationship.includes('₹1,50,000'),
      'Relationship variation must retain project requirements'
    );
    assert(
      variationsA.concise.includes('admin dashboard') || variationsA.concise.includes('₹1,50,000'),
      'Concise variation must retain project requirements'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE B: E-Commerce Inquiry (No Budget, No Timeline)
  // --------------------------------------------------------------------------
  console.log('\n--- CASE B: E-COMMERCE INQUIRY WITH NO BUDGET OR TIMELINE ---');
  const emailBBody = `Hi Evores,

We need an e-commerce website for our clothing brand with product browsing and online ordering.
Could you let us know what the next steps are?`;

  await test('B.1: Memory does NOT extract false timeline from "in clothing" or generic words', async () => {
    const memB = buildStructuredConversationContext({
      history: [],
      latestMessage: emailBBody,
      companyContext,
      currentIntent: 'service_inquiry',
      subject: 'E-commerce Website',
    });

    assert(!memB.facts.timeline, `Timeline must be undefined for Email B, but got "${memB.facts.timeline}"`);
    assert(!memB.facts.budget, `Budget must be undefined for Email B, but got "${memB.facts.budget}"`);
    assert(
      memB.facts.features.some((f) => f.toLowerCase().includes('product') || f.toLowerCase().includes('order')),
      'Features must identify product browsing or online ordering'
    );
  });

  await test('B.2: Permission evaluation treats Email B as safe service inquiry with 0 timeline restrictions', async () => {
    const memB = buildStructuredConversationContext({
      history: [],
      latestMessage: emailBBody,
      companyContext,
      currentIntent: 'service_inquiry',
      subject: 'E-commerce Website',
    });

    const permB = evaluatePermissionAndRisk({
      messageText: emailBBody,
      companyContext,
      structuredContext: memB,
      intent: 'service_inquiry',
    });

    assert(
      !permB.restrictedTopics.includes('delivery_deadline_guarantee'),
      'Email B must NOT trigger delivery_deadline_guarantee'
    );
    assert(
      !permB.restrictedTopics.includes('delivery_timelines'),
      'Email B must NOT trigger delivery_timelines'
    );
    assert(
      !permB.customerHoldingResponse,
      'Email B must NOT generate a timeline holding response'
    );
    assert(permB.decision === 'SAFE_AUTO_REPLY', `Email B must be SAFE_AUTO_REPLY, got ${permB.decision}`);
  });

  await test('B.3: Customer response validation rejects any reply falsely claiming Email B provided a timeline', async () => {
    const falseTimelineReply =
      'Hi,\n\nThanks for outlining your timeline requirements. While we understand the urgency, our team needs to review the project scope and resource availability before we can commit to a guaranteed delivery date.\n\nBest regards,\nEvores';

    const valResult = validateCustomerResponse({
      reply: falseTimelineReply,
      clientMessage: emailBBody,
      companyContext,
      knownRequirements: {
        projectType: 'e-commerce website for clothing brand',
        features: ['product browsing', 'online ordering'],
      },
    });

    assert(
      !valResult.isValid || valResult.hasFabricatedTimeline || valResult.isGeneric,
      'Validator must reject generic timeline reply on an email with no timeline'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE C: SaaS Inquiry with Explicit Tech Stack & Budget
  // --------------------------------------------------------------------------
  console.log('\n--- CASE C: SAAS INQUIRY WITH EXPLICIT TECHNICAL REQUIREMENTS ---');
  const emailCBody = `Hello Evores,

We are planning to build a multi-tenant B2B SaaS platform for invoice automation.
Technical requirements:
- Next.js frontend, Node.js backend, PostgreSQL database
- Stripe billing integration with tiered recurring subscriptions
- Role-based access control (RBAC) and audit logging
- Budget: ₹4,00,000
- Timeline: 3 months

Please let us know your availability.`;

  await test('C.1: Memory captures SaaS projectType, techStack, budget, and 3 months timeline', async () => {
    const memC = buildStructuredConversationContext({
      history: [],
      latestMessage: emailCBody,
      companyContext,
      currentIntent: 'project_request',
      subject: 'B2B SaaS Platform',
    });

    assert(memC.facts.timeline === '3 months' || memC.facts.timeline === 'in 3 months', `Timeline should be 3 months, got "${memC.facts.timeline}"`);
    assert(Boolean(memC.facts.budget?.includes('4,00,000')), `Budget should be ₹4,00,000, got "${memC.facts.budget}"`);
  });

  await test('C.2: Draft variation engine preserves B2B SaaS requirements and ₹4,00,000 budget', async () => {
    const baseDraftC =
      'Hi,\n\nThanks for reaching out to Evores. We would be excited to partner with you on building your multi-tenant B2B SaaS invoice automation platform with Next.js, Node.js, and PostgreSQL.\n\nYour ₹4,00,000 budget and 3-month timeline provide a solid foundation for delivering the core multi-tenancy, Stripe subscription billing, and RBAC architecture. Let us know when you would be open for a technical scoping call.\n\nBest regards,\nEvores';

    const variationsC = generateDraftVariations({
      messageText: emailCBody,
      baseDraft: baseDraftC,
      companyContext,
      restrictedTopics: ['pricing_commitment'],
    });

    assert(variationsC.professional.includes('₹4,00,000'), 'Draft must preserve ₹4,00,000 budget');
    assert(variationsC.professional.includes('SaaS') || variationsC.professional.includes('invoice'), 'Draft must preserve SaaS context');
    assert(!variationsC.professional.includes('guaranteed delivery date'), 'Draft must not insert canned guarantee boilerplate');
  });

  // --------------------------------------------------------------------------
  // TEST CASE D: Exploratory Project Inquiry (Incomplete Requirements)
  // --------------------------------------------------------------------------
  console.log('\n--- CASE D: EXPLORATORY PROJECT INQUIRY (INCOMPLETE REQUIREMENTS) ---');
  const emailDBody = `Hi,

We are exploring building a digital portal or mobile app for logistics tracking.
We don't have our requirements finalized yet and no budget set.
Could you share what features you recommend for such a portal and how you typically approach initial scoping?`;

  await test('D.1: Memory correctly identifies missing fields and does not fabricate budget or timeline', async () => {
    const memD = buildStructuredConversationContext({
      history: [],
      latestMessage: emailDBody,
      companyContext,
      currentIntent: 'service_inquiry',
      subject: 'Logistics Tracking Portal',
    });

    assert(!memD.facts.budget, 'Budget must not be fabricated');
    assert(!memD.facts.timeline, 'Timeline must not be fabricated');
  });

  await test('D.2: Response validator flags if a reply pretends a budget or timeline was provided', async () => {
    const hallucinatoryReply =
      'Hi,\n\nThanks for reaching out. We would be happy to build your logistics app within your ₹2,00,000 budget and 4-week timeline.\n\nBest regards,\nEvores';

    const valResult = validateCustomerResponse({
      reply: hallucinatoryReply,
      clientMessage: emailDBody,
      companyContext,
      knownRequirements: {
        projectType: 'logistics tracking portal',
        features: ['tracking'],
      },
    });

    assert(
      !valResult.isValid || valResult.hasFabricatedPrice || valResult.hasFabricatedTimeline,
      'Validator must reject reply that hallucinates budget or timeline'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE E: Cross-Customer Isolation & No Information Leak
  // --------------------------------------------------------------------------
  console.log('\n--- CASE E: CROSS-CUSTOMER ISOLATION (ZERO INFORMATION LEAK) ---');
  await test('E.1: Customer B email processing contains 0 elements from Customer A email', async () => {
    const mockProvider = new DeterministicMockProvider();

    // Process Email A
    const msgAId = `msg_test_leak_a_${Date.now()}`;
    await processInboundEmail(
      {
        messageId: msgAId,
        sender: 'customer.a.web@example.com',
        recipient: 'hello@evores.com',
        subject: 'Website Development Inquiry',
        text: emailABody,
        timestamp: Date.now(),
        metadata: {
          gmailMessageId: msgAId,
          gmailThreadId: `thread_a_${Date.now()}`,
        },
      },
      mockProvider
    );

    // Process Email B (different sender, new thread)
    const msgBId = `msg_test_leak_b_${Date.now()}`;
    const resultB = await processInboundEmail(
      {
        messageId: msgBId,
        sender: 'customer.b.clothing@example.com',
        recipient: 'hello@evores.com',
        subject: 'E-commerce Website',
        text: emailBBody,
        timestamp: Date.now(),
        metadata: {
          gmailMessageId: msgBId,
          gmailThreadId: `thread_b_${Date.now()}`,
        },
      },
      mockProvider
    );

    const sentForB = mockProvider.sentEmails.find((e) => e.to === 'customer.b.clothing@example.com');
    const responseText = sentForB ? sentForB.body : resultB.aiResult?.reply || '';

    assert(
      !responseText.includes('1,50,000') && !responseText.includes('2,00,000'),
      'Customer B reply must NEVER contain Customer A budget (₹1,50,000–₹2,00,000)'
    );
    assert(
      !responseText.includes('6–8 weeks') && !responseText.includes('6-8 weeks'),
      'Customer B reply must NEVER contain Customer A timeline (6–8 weeks)'
    );
    assert(
      !responseText.includes('admin dashboard'),
      'Customer B reply must NEVER contain Customer A specific feature (admin dashboard)'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE F: Approval Queue Fidelity & No Automatic Holding Response for Project Inquiries
  // --------------------------------------------------------------------------
  console.log('\n--- CASE F: APPROVAL QUEUE INTEGRITY & DISPATCH ---');
  await test('F.1: Project inquiry requiring approval does NOT send automatic generic holding email', async () => {
    const mockProvider = new DeterministicMockProvider();
    const msgId = `msg_test_approval_held_${Date.now()}`;

    const result = await processInboundEmail(
      {
        messageId: msgId,
        sender: 'inquiry.website@example.com',
        recipient: 'hello@evores.com',
        subject: 'Website Development Inquiry',
        text: emailABody,
        timestamp: Date.now(),
        metadata: {
          companyId: company!.id,
          gmailMessageId: msgId,
          gmailThreadId: `thread_held_${Date.now()}`,
        },
      },
      mockProvider
    );

    assert(result.success === true, 'Inbound processing must succeed');
    assert(result.approvalRequired === true, 'Project inquiry with budget and timeline requires approval');
    assert(
      result.holdingResponseSent === false,
      'Holding response must NOT be sent automatically for project inquiries requiring approval'
    );
    assert(
      mockProvider.sentEmails.length === 0,
      'No email must be sent to the customer until human approval is granted'
    );
    assert(Boolean(result.approvalItem), 'Approval item must be created in queue');
  });

  await test('F.2: Approving the queued item sends the exact reviewed draft acknowledging features & budget', async () => {
    const mockProvider = new DeterministicMockProvider();
    const msgId = `msg_test_approve_send_${Date.now()}`;

    const inboundRes = await processInboundEmail(
      {
        messageId: msgId,
        sender: 'inquiry.approve@example.com',
        recipient: 'hello@evores.com',
        subject: 'Website Development Inquiry',
        text: emailABody,
        timestamp: Date.now(),
        metadata: {
          companyId: company!.id,
          gmailMessageId: msgId,
          gmailThreadId: `thread_approve_${Date.now()}`,
        },
      },
      mockProvider
    );

    const itemId = inboundRes.approvalItem!.id;
    const item = await getApprovalItem(company!.id, itemId);
    assert(Boolean(item), 'Item must exist in approval queue');

    // The draft must be specific to Email A
    assert(
      item!.currentDraft.includes('₹1,50,000') ||
        item!.currentDraft.includes('admin dashboard') ||
        item!.currentDraft.includes('testimonials'),
      'Current draft in approval queue must acknowledge Email A specifics'
    );

    // Approve and send
    const sendRes = await approveAndSendItem(company!.id, itemId, {
      userEmail: 'reviewer@evores.com',
      provider: mockProvider,
    });

    assert(sendRes.success === true, `Approve and send must succeed, got error: ${sendRes.error}`);
    assert(mockProvider.sentEmails.length === 1, 'Exactly 1 email must be sent upon approval');
    const sentEmail = mockProvider.sentEmails[0];
    assert(sentEmail.to === 'inquiry.approve@example.com', 'Sent to correct recipient');
    assert(
      sentEmail.body.includes('₹1,50,000') ||
        sentEmail.body.includes('admin dashboard') ||
        sentEmail.body.includes('responsive business website'),
      'Dispatched email must contain the reviewed, specific project details'
    );
    assert(
      !sentEmail.body.includes('commit to a guaranteed delivery date'),
      'Dispatched email must NOT contain the canned generic timeline template'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE G: Live Gemini AI Model Verification
  // --------------------------------------------------------------------------
  console.log('\n--- CASE G: LIVE GEMINI AI MODEL VERIFICATION ---');
  await test('G.1: Live Gemini model receives Email A and generates specific, personalized response', async () => {
    const geminiResA = await callGeminiRequirementAgent({
      history: [],
      latestMessage: emailABody,
      companyContext,
      intent: 'service_inquiry',
      subject: 'Website Development Inquiry',
    });

    console.log('\n[Live Gemini Reply A Snippet]:\n', geminiResA.reply.substring(0, 180), '...\n');
    assert(
      geminiResA.reply.toLowerCase().includes('website'),
      'Live model must acknowledge website'
    );
    assert(
      geminiResA.reply.includes('1,50,000') ||
        geminiResA.reply.includes('6–8') ||
        geminiResA.reply.includes('6-8') ||
        geminiResA.reply.toLowerCase().includes('dashboard'),
      'Live model must acknowledge budget, timeline, or features for Email A'
    );
    assert(
      !geminiResA.reply.includes('commit to a guaranteed delivery date'),
      'Live model must NOT emit canned holding response'
    );
  });

  await test('G.2: Live Gemini model receives Email B and acknowledges clothing e-commerce without claiming timeline', async () => {
    const geminiResB = await callGeminiRequirementAgent({
      history: [],
      latestMessage: emailBBody,
      companyContext,
      intent: 'service_inquiry',
      subject: 'E-commerce Website',
    });

    console.log('\n[Live Gemini Reply B Snippet]:\n', geminiResB.reply.substring(0, 180), '...\n');
    assert(
      geminiResB.reply.toLowerCase().includes('clothing') ||
        geminiResB.reply.toLowerCase().includes('e-commerce') ||
        geminiResB.reply.toLowerCase().includes('online store'),
      'Live model must acknowledge clothing brand / e-commerce'
    );
    assert(
      !geminiResB.reply.includes('Thanks for outlining your timeline requirements'),
      'Live model must NOT claim customer outlined timeline requirements'
    );
    assert(
      geminiResB.extractedRequirements.timeline === '' ||
        geminiResB.extractedRequirements.timeline === undefined,
      'Extracted timeline for Email B must be empty'
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE H: PRIYA MEHTA EXACT INBOUND EMAIL & REJECTION OF DEFECTIVE REPLY
  // --------------------------------------------------------------------------
  console.log('\n--- CASE H: PRIYA MEHTA EXACT INBOUND EMAIL & REJECTION OF DEFECTIVE REPLY ---');
  const priyaEmailBody = `Hello,\n\nWe want to develop an e-commerce website for our clothing brand. Customers should be able to browse products and place orders online.\n\nWe are interested in working with your team. Please let us know the next steps.\n\nThanks,\nPriya Mehta`;
  const defectiveHoldingReply = `Thanks for outlining your timeline requirements. While we understand the urgency, our team needs to review the project scope and resource availability before we can commit to a guaranteed delivery date.\n\nI'll coordinate with our team and get back to you shortly with confirmed scheduling options.`;

  await test('H.1: Defective timeline/guarantee reply is strictly REJECTED by validator for Priya Mehta email', async () => {
    const valResult = validateCustomerResponse({
      reply: defectiveHoldingReply,
      clientMessage: priyaEmailBody,
      companyContext,
      knownRequirements: {
        projectType: 'e-commerce website for clothing brand',
        features: ['product browsing and catalog', 'online ordering'],
        clientName: 'Priya Mehta',
      },
    });

    assert(
      !valResult.isValid,
      'Defective timeline reply must fail response validation on an inquiry with no timeline'
    );
    assert(
      valResult.hasFabricatedTimeline || valResult.isGeneric,
      'Defective reply must be tagged with hasFabricatedTimeline or isGeneric'
    );
  });

  await test('H.2: Processing Priya Mehta exact email produces clothing e-commerce draft, 0 holding replies, and holds for approval', async () => {
    // Configure human approval required for outbound responses
    await updateCompanyPermissionConfig(company!.id, {
      autonomyMode: 'NO_AUTONOMOUS_ACCESS',
    });

    const mockProvider = new DeterministicMockProvider();
    const msgId = `msg_priya_${Date.now()}`;
    const threadId = `thread_priya_${Date.now()}`;

    const inboundResult = await processInboundEmail(
      {
        messageId: msgId,
        sender: 'priya.mehta.clothing@example.com',
        senderName: 'Priya Mehta',
        recipient: 'hello@evores.com',
        subject: 'Need an E-Commerce Website',
        text: priyaEmailBody,
        timestamp: Date.now(),
        metadata: {
          companyId: company!.id,
          gmailMessageId: msgId,
          gmailThreadId: threadId,
        },
      },
      mockProvider
    );

    assert(inboundResult.success === true, 'Priya Mehta email processing must succeed');
    assert(inboundResult.approvalRequired === true, 'Inquiry must require human approval before sending');
    assert(
      inboundResult.holdingResponseSent === false,
      'Holding response must NOT be sent automatically to Priya Mehta'
    );
    assert(
      mockProvider.sentEmails.length === 0,
      'No email must be dispatched automatically to customer before review'
    );
    assert(Boolean(inboundResult.approvalItem), 'Approval item must be created in queue');

    const item = await getApprovalItem(company!.id, inboundResult.approvalItem!.id);
    assert(Boolean(item), 'Approval item must exist in queue');
    assert(item!.status === 'PENDING', 'Approval item must be in PENDING status');
    assert(item!.holdingResponseSent === false, 'Approval item holdingResponseSent must be false');

    const draftText = item!.currentDraft;
    const lowerDraft = draftText.toLowerCase();

    // Positive assertions: must discuss clothing, e-commerce, browsing, ordering, next steps
    assert(
      lowerDraft.includes('clothing') || lowerDraft.includes('e-commerce') || lowerDraft.includes('online store') || lowerDraft.includes('products'),
      `Draft must mention clothing brand or e-commerce website, got: "${draftText}"`
    );
    assert(
      lowerDraft.includes('browsing') || lowerDraft.includes('ordering') || lowerDraft.includes('products') || lowerDraft.includes('order'),
      `Draft must mention product browsing or online orders, got: "${draftText}"`
    );

    // Negative assertions: must NEVER mention timeline requirements, urgency, guaranteed delivery date, or scheduling options
    assert(
      !draftText.includes('outlining your timeline requirements') &&
      !draftText.includes('commit to a guaranteed delivery date') &&
      !lowerDraft.includes('urgency') &&
      !draftText.includes('confirmed scheduling options'),
      `Draft must NOT contain timeline/guarantee boilerplate! Got: "${draftText}"`
    );
  });

  // --------------------------------------------------------------------------
  // TEST CASE I: CROSS-THREAD CONTAMINATION TEST (SAME SENDER, SEQUENTIAL THREADS)
  // --------------------------------------------------------------------------
  console.log('\n--- CASE I: CROSS-THREAD CONTAMINATION TEST (SAME SENDER, SEQUENTIAL THREADS) ---');
  await test('I.1: Thread 2 from same sender does NOT inherit timeline, deadline, or budget from Thread 1', async () => {
    await updateCompanyPermissionConfig(company!.id, {
      autonomyMode: 'NO_AUTONOMOUS_ACCESS',
    });

    const mockProvider = new DeterministicMockProvider();
    const commonSender = `shared.tester.${Date.now()}@example.com`;

    // Thread 1: Urgent 3-week deadline inquiry
    const msg1Id = `msg_thread1_${Date.now()}`;
    const thread1Id = `thread1_${Date.now()}`;
    const thread1Body = `Hi team,\n\nWe need a custom inventory management portal completed within 3 weeks. Target launch: 3 weeks.\n\nThanks,\nRahul`;

    const res1 = await processInboundEmail(
      {
        messageId: msg1Id,
        sender: commonSender,
        senderName: 'Rahul',
        recipient: 'hello@evores.com',
        subject: 'Urgent: Inventory Portal',
        text: thread1Body,
        timestamp: Date.now(),
        metadata: {
          companyId: company!.id,
          gmailMessageId: msg1Id,
          gmailThreadId: thread1Id,
        },
      },
      mockProvider
    );

    assert(res1.success === true, 'Thread 1 processing must succeed');

    // Thread 2: Priya Mehta's exact e-commerce website email from the SAME sender, different thread
    const msg2Id = `msg_thread2_${Date.now()}`;
    const thread2Id = `thread2_${Date.now()}`;

    const res2 = await processInboundEmail(
      {
        messageId: msg2Id,
        sender: commonSender,
        senderName: 'Priya Mehta',
        recipient: 'hello@evores.com',
        subject: 'Need an E-Commerce Website',
        text: priyaEmailBody,
        timestamp: Date.now() + 1000,
        metadata: {
          companyId: company!.id,
          gmailMessageId: msg2Id,
          gmailThreadId: thread2Id,
        },
      },
      mockProvider
    );

    assert(res2.success === true, 'Thread 2 processing must succeed');

    const thread2Draft = res2.approvalItem
      ? res2.approvalItem.currentDraft
      : res2.aiResult?.reply || '';

    const thread2Req = res2.aiResult?.extractedRequirements;
    const thread2Facts = res2.aiResult?.structuredContext?.facts;
    const thread2Perm = res2.aiResult?.permissionEvaluation;

    // Zero contamination assertions
    assert(
      !thread2Req?.timeline,
      `Thread 2 must NOT inherit Thread 1 timeline! Got: "${thread2Req?.timeline}"`
    );
    assert(
      !thread2Facts?.timeline,
      `Thread 2 structured facts must NOT inherit Thread 1 timeline! Got: "${thread2Facts?.timeline}"`
    );
    assert(
      !thread2Perm?.restrictedTopics?.includes('delivery_deadline_guarantee') &&
      !thread2Perm?.restrictedTopics?.includes('delivery_timelines'),
      `Thread 2 must NOT flag delivery restrictions from Thread 1! Got: ${JSON.stringify(thread2Perm?.restrictedTopics)}`
    );
    assert(
      !thread2Draft.includes('3 weeks') &&
      !thread2Draft.includes('outlining your timeline requirements') &&
      !thread2Draft.includes('guaranteed delivery date'),
      `Thread 2 draft must NOT contain 3 weeks or timeline guarantee text! Got: "${thread2Draft}"`
    );
    assert(
      thread2Draft.toLowerCase().includes('clothing') || thread2Draft.toLowerCase().includes('e-commerce') || thread2Draft.toLowerCase().includes('online store'),
      `Thread 2 draft must focus on clothing e-commerce! Got: "${thread2Draft}"`
    );
  });

  console.log('\n========================================================================');
  console.log(`  REGRESSION TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');
}

runRegressionTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
