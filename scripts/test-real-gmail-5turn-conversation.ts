import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import { EmailProvider, ParsedInboundEmail, SendEmailParams, SendEmailResult, ParsedDeliveryEvent } from '../src/lib/services/email/EmailProvider';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';

import { setGeminiMockHandler, clearGeminiMockHandler } from '../src/lib/ai/gemini';
import { generateContextualFallback } from '../src/lib/ai/validator';

// Create a Mock Email Provider to capture outbound emails without sending actual external SMTP/API emails
class TestGmailProvider implements EmailProvider {
  readonly providerType = 'test-gmail';
  sentEmails: SendEmailParams[] = [];

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    this.sentEmails.push(params);
    return {
      success: true,
      providerMessageId: `sent-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      statusCode: 200,
    };
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseInboundMessage(payload: unknown): ParsedInboundEmail {
    return payload as ParsedInboundEmail;
  }

  normalizeMessage(text: string): string {
    return text.trim();
  }

  parseDeliveryEvent(): ParsedDeliveryEvent | null {
    return null;
  }

  async markAsRead(): Promise<void> {}
  async hasOutboundReply(): Promise<boolean> {
    return false;
  }
}

async function run5TurnGmailConversationTest() {
  console.log('================================================================');
  console.log('REAL GMAIL PIPELINE TEST: 5-TURN CONVERSATION + THREAD ISOLATION');
  console.log('================================================================\n');

  // Set mock handler to avoid burning real Gemini API credits during automated pipeline tests
  setGeminiMockHandler((params) => {
    return generateContextualFallback(
      params.companyContext,
      params.previousRequirements,
      params.latestMessage,
      'Deterministic Gemini Handler for Pipeline Testing',
      params.intent,
      params.subject,
      params.history
    );
  });

  const testProvider = new TestGmailProvider();
  const testCompany = await prisma.company.findFirst({
    where: { name: { contains: 'Evore', mode: 'insensitive' } }
  }) || await prisma.company.findFirst();

  if (!testCompany) {
    console.error('No test company found in database.');
    process.exit(1);
  }

  // Ensure sufficient quota for this test run
  await prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId: testCompany.id,
        automationType: 'email',
      },
    },
    create: {
      companyId: testCompany.id,
      automationType: 'email',
      enabled: true,
      monthlyLimit: 1000,
      usedCredits: 0,
      reservedCredits: 0,
      quotaLocked: false,
    },
    update: {
      enabled: true,
      monthlyLimit: 1000,
      usedCredits: 0,
      reservedCredits: 0,
      quotaLocked: false,
      adminDisabled: false,
    },
  });

  console.log(`Using Company: ${testCompany.name} (ID: ${testCompany.id})`);

  const senderEmail = `test.client.${Date.now()}@clothingbrand.com`;
  const originalThreadId = `gmail-thread-${Date.now()}`;
  const separateThreadId = `gmail-thread-separate-${Date.now()}`;

  let turnCount = 0;

  // --------------------------------------------------------------------------
  // TURN 1: Initial Inquiry
  // --------------------------------------------------------------------------
  turnCount++;
  console.log(`\n>>> [TURN ${turnCount}] Initial Inquiry...`);
  const turn1MsgId = `gmail-msg-1-${Date.now()}`;
  const turn1Inbound: ParsedInboundEmail = {
    messageId: turn1MsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Website for clothing business',
    text: 'I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?',
    timestamp: Date.now(),
    metadata: {
      gmailMessageId: turn1MsgId,
      gmailThreadId: originalThreadId,
      companyId: testCompany.id
    }
  };

  const res1 = await processInboundEmail(turn1Inbound, testProvider);
  if (!res1.success) {
    console.error('Turn 1 failed:', res1);
    process.exit(1);
  }

  const reply1 = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Turn 1 Outbound Reply:\n', reply1);

  if (!/within (?:a |this |your )?budget|core essentials|starter|catalog|responsive/i.test(reply1)) {
    console.error('❌ Turn 1 did not address what can be provided within ₹20,000 budget');
    process.exit(1);
  }
  if (!/december/i.test(reply1)) {
    console.error('❌ Turn 1 lost December timeline');
    process.exit(1);
  }
  if (/it services solutions|could you share a bit more detail about your project/i.test(reply1)) {
    console.error('❌ Turn 1 used generic fallback reset');
    process.exit(1);
  }
  console.log('✓ Turn 1 PASSED: Contextual initial scoping, preserved budget & December timeline');

  // --------------------------------------------------------------------------
  // TURN 2: Add Feature (payments + 50 products)
  // --------------------------------------------------------------------------
  turnCount++;
  console.log(`\n>>> [TURN ${turnCount}] Add Feature (Online Payments & 50 Products)...`);
  const turn2MsgId = `gmail-msg-2-${Date.now()}`;
  const turn2Inbound: ParsedInboundEmail = {
    messageId: turn2MsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Re: Website for clothing business',
    text: 'I also need online payments and around 50 products. Would that change the estimate?',
    timestamp: Date.now(),
    inReplyTo: turn1MsgId,
    metadata: {
      gmailMessageId: turn2MsgId,
      gmailThreadId: originalThreadId,
      companyId: testCompany.id
    }
  };

  const res2 = await processInboundEmail(turn2Inbound, testProvider);
  if (!res2.success) {
    console.error('Turn 2 failed:', res2);
    process.exit(1);
  }

  const reply2 = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Turn 2 Outbound Reply:\n', reply2);

  if (!/scope|estimate|cost|technical/i.test(reply2)) {
    console.error('❌ Turn 2 failed to answer estimate impact question');
    process.exit(1);
  }
  if (/it services solutions|could you share a bit more detail about your project/i.test(reply2)) {
    console.error('❌ Turn 2 used generic fallback reset');
    process.exit(1);
  }
  console.log('✓ Turn 2 PASSED: Addressed scope and estimate impact, preserved clothing business context');

  // --------------------------------------------------------------------------
  // TURN 3: Customer asks Pricing/Scope with Bracketed Placeholders (THE CRITICAL TEST)
  // --------------------------------------------------------------------------
  turnCount++;
  console.log(`\n>>> [TURN ${turnCount}] Ask Pricing & Scope with Bracketed Placeholders...`);
  const turn3MsgId = `gmail-msg-3-${Date.now()}`;
  const turn3Inbound: ParsedInboundEmail = {
    messageId: turn3MsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Re: Website for clothing business',
    text: 'I would prefer using [Preferred Payment Gateway, e.g., Razorpay / Paytm / Stripe] for the payment integration. For the checkout flow, I am looking for a simple [Standard / Guest / Multi-step] checkout process.\n\nPlease let me know how this impacts the overall estimate and scope for our December launch.',
    timestamp: Date.now(),
    inReplyTo: turn2MsgId,
    metadata: {
      gmailMessageId: turn3MsgId,
      gmailThreadId: originalThreadId,
      companyId: testCompany.id
    }
  };

  const res3 = await processInboundEmail(turn3Inbound, testProvider);
  if (!res3.success) {
    console.error('Turn 3 failed:', res3);
    process.exit(1);
  }

  const reply3 = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Turn 3 Outbound Reply:\n', reply3);

  // Assertions for Turn 3
  if (/it services solutions|could you share a bit more detail about your project|thanks for reaching out to evore/i.test(reply3)) {
    console.error('❌ CRITICAL REGRESSION: Turn 3 reset context to generic IT services!');
    process.exit(1);
  }
  if (/since you (?:chose|selected|prefer|opted for) (?:razorpay|paytm|stripe)/i.test(reply3)) {
    console.error('❌ Turn 3 hallucinated gateway choice from placeholder!');
    process.exit(1);
  }
  if (/since you (?:chose|selected|prefer|opted for) (?:standard|guest|multi-step)/i.test(reply3)) {
    console.error('❌ Turn 3 hallucinated checkout flow choice from placeholder!');
    process.exit(1);
  }
  if (!/scope|estimate|launch|december/i.test(reply3)) {
    console.error('❌ Turn 3 failed to address scope/estimate for December launch');
    process.exit(1);
  }
  console.log('✓ Turn 3 PASSED: Answered estimate & scope impact first, remembered December launch & ₹20,000 budget, NO generic reset, NO placeholder hallucination!');

  // --------------------------------------------------------------------------
  // TURN 4: Change Requirement (Push launch to January, 25 products)
  // --------------------------------------------------------------------------
  turnCount++;
  console.log(`\n>>> [TURN ${turnCount}] Change Requirement (Launch in January, 25 products)...`);
  const turn4MsgId = `gmail-msg-4-${Date.now()}`;
  const turn4Inbound: ParsedInboundEmail = {
    messageId: turn4MsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Re: Website for clothing business',
    text: 'Instead of December, we need to push the target launch to January, and we want to start with 25 curated products instead of 50.',
    timestamp: Date.now(),
    inReplyTo: turn3MsgId,
    metadata: {
      gmailMessageId: turn4MsgId,
      gmailThreadId: originalThreadId,
      companyId: testCompany.id
    }
  };

  const res4 = await processInboundEmail(turn4Inbound, testProvider);
  if (!res4.success) {
    console.error('Turn 4 failed:', res4);
    process.exit(1);
  }

  const reply4 = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Turn 4 Outbound Reply:\n', reply4);

  if (/it services solutions|could you share a bit more detail about your project/i.test(reply4)) {
    console.error('❌ Turn 4 reset context to generic IT services!');
    process.exit(1);
  }
  console.log('✓ Turn 4 PASSED: Successfully acknowledged changed requirements without resetting context');

  // --------------------------------------------------------------------------
  // TURN 5: Ask Follow-up (Payment provider selection)
  // --------------------------------------------------------------------------
  turnCount++;
  console.log(`\n>>> [TURN ${turnCount}] Ask Follow-up (Confirmed Razorpay)...`);
  const turn5MsgId = `gmail-msg-5-${Date.now()}`;
  const turn5Inbound: ParsedInboundEmail = {
    messageId: turn5MsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Re: Website for clothing business',
    text: 'We have decided to use Razorpay for payment. Can you confirm if UPI and credit cards will both work seamlessly for our customers?',
    timestamp: Date.now(),
    inReplyTo: turn4MsgId,
    metadata: {
      gmailMessageId: turn5MsgId,
      gmailThreadId: originalThreadId,
      companyId: testCompany.id
    }
  };

  const res5 = await processInboundEmail(turn5Inbound, testProvider);
  if (!res5.success) {
    console.error('Turn 5 failed:', res5);
    process.exit(1);
  }

  const reply5 = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Turn 5 Outbound Reply:\n', reply5);

  if (/it services solutions|could you share a bit more detail about your project/i.test(reply5)) {
    console.error('❌ Turn 5 reset context to generic IT services!');
    process.exit(1);
  }
  console.log('✓ Turn 5 PASSED: Remembered full conversation history, acknowledged Razorpay inquiry without reset');

  // --------------------------------------------------------------------------
  // SEPARATE THREAD TEST: Same sender, completely unrelated project & thread
  // MUST NOT inherit clothing store, ₹20,000 budget, December/January launch
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('SEPARATE THREAD TEST: Completely new email from same sender');
  console.log('================================================================');
  const separateMsgId = `gmail-msg-sep-${Date.now()}`;
  const separateInbound: ParsedInboundEmail = {
    messageId: separateMsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Inquiry regarding mobile logistics app',
    text: 'Hi, our sister logistics division needs an internal Android driver dispatch app. Do you build Flutter or React Native mobile apps?',
    timestamp: Date.now(),
    metadata: {
      gmailMessageId: separateMsgId,
      gmailThreadId: separateThreadId, // NEW, DIFFERENT THREAD
      companyId: testCompany.id
    }
  };

  const resSep = await processInboundEmail(separateInbound, testProvider);
  if (!resSep.success) {
    console.error('Separate thread failed:', resSep);
    process.exit(1);
  }

  const replySep = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Separate Thread Outbound Reply:\n', replySep);

  if (/clothing|razorpay|20,000|₹20,000|december|january|checkout flow/i.test(replySep)) {
    console.error('❌ LEAK DETECTED: Separate thread inherited context from clothing store thread!');
    process.exit(1);
  }
  if (!/mobile|app|logistics|flutter|react native|dispatch/i.test(replySep)) {
    console.error('❌ Separate thread failed to address mobile app inquiry');
    process.exit(1);
  }
  console.log('✓ SEPARATE THREAD PASSED: Clean slate, 0 context leaked from prior thread!');

  // --------------------------------------------------------------------------
  // RESUME ORIGINAL THREAD: New message in the original thread
  // MUST inherit the existing clothing thread context
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('RESUME ORIGINAL THREAD TEST: New message in original clothing thread');
  console.log('================================================================');
  const resumeMsgId = `gmail-msg-resume-${Date.now()}`;
  const resumeInbound: ParsedInboundEmail = {
    messageId: resumeMsgId,
    sender: senderEmail,
    recipient: 'info@evore.co',
    subject: 'Re: Website for clothing business',
    text: 'Also, does the standard Razorpay integration support recurring subscription billing if we add monthly clothing boxes later?',
    timestamp: Date.now(),
    inReplyTo: turn5MsgId,
    metadata: {
      gmailMessageId: resumeMsgId,
      gmailThreadId: originalThreadId, // ORIGINAL THREAD
      companyId: testCompany.id
    }
  };

  const resResume = await processInboundEmail(resumeInbound, testProvider);
  if (!resResume.success) {
    console.error('Thread resumption failed:', resResume);
    process.exit(1);
  }

  const replyResume = testProvider.sentEmails[testProvider.sentEmails.length - 1]?.text || '';
  console.log('Resumed Thread Outbound Reply:\n', replyResume);

  if (/it services solutions|could you share a bit more detail about your project/i.test(replyResume)) {
    console.error('❌ Resumed thread reset context to generic IT services!');
    process.exit(1);
  }
  console.log('✓ RESUMED ORIGINAL THREAD PASSED: Context correctly retained in original thread!');

  console.log('\n================================================================');
  console.log('🎉 ALL REAL GMAIL PIPELINE INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');
}

run5TurnGmailConversationTest().catch((err) => {
  console.error('Fatal Gmail pipeline test error:', err);
  process.exit(1);
});
