import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import { getGoogleProviderForCompany } from '../src/lib/services/email/emailProviderFactory';
import { ParsedInboundEmail } from '../src/lib/services/email/EmailProvider';

async function runLiveGeminiE2E() {
  console.log('================================================================');
  console.log('  RUNNING LIVE E2E GMAIL + REAL GEMINI TEST');
  console.log('================================================================\n');

  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) {
    throw new Error('Evores company not found');
  }

  // Create an isolated lead or use existing lead for test
  const testThreadId = `real-thread-${Date.now()}`;
  const senderEmail = 'hritikgautam362@gmail.com';
  const recipientEmail = 'evores.co@gmail.com';

  console.log(`[Config] Company: ${evores.name} (${evores.id})`);
  console.log(`[Config] Thread ID: ${testThreadId}`);
  console.log(`[Config] Sender: ${senderEmail}`);

  // Create a mock provider that doesn't actually send real outbound emails to the customer during test,
  // but exercises the full production pipeline: resolution, classification, real Gemini AI, validator, DB persistence.
  const sentEmails: Array<{ to: string; subject: string; body: string }> = [];
  const testProvider = {
    async sendMessage(msg: { to: string; subject: string; text: string; html?: string; inReplyTo?: string; references?: string; metadata?: Record<string, unknown> }) {
      console.log(`\n>>> [OUTBOUND EMAIL SENT via activeProvider.sendMessage] >>>`);
      console.log(`To: ${msg.to}`);
      console.log(`Subject: ${msg.subject}`);
      console.log(`Body:\n${msg.text}\n<<< END OUTBOUND EMAIL <<<\n`);
      sentEmails.push({ to: msg.to, subject: msg.subject, body: msg.text });
      return { success: true, messageId: `sent-${Date.now()}` };
    },
    async markAsRead(messageId: string) {
      // noop
    },
    async hasOutboundReply() {
      return false;
    },
  };

  // --------------------------------------------------------------------------
  // TURN 1: Brand-New Website Inquiry with ₹20,000 Budget & December Target
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  TURN 1: NEW INQUIRY (Real Gemini Call)');
  console.log('================================================================');

  const msg1Id = `live-msg-1-${Date.now()}`;
  const email1: ParsedInboundEmail = {
    messageId: msg1Id,
    sender: senderEmail,
    recipient: recipientEmail,
    subject: 'Website for clothing business',
    text: 'Hi FillFlow, I need a website for my clothing business. My budget is ₹20,000 and I want it launched by December. Can you tell me what you can provide within this budget?',
    timestamp: Date.now(),
    metadata: {
      gmailMessageId: msg1Id,
      gmailThreadId: testThreadId,
      companyId: evores.id,
    },
  };

  const result1 = await processInboundEmail(email1, testProvider as any);
  console.log('\n[Turn 1 Result]:', {
    status: result1.status,
    classification: result1.classification,
    leadId: result1.leadId,
    replySent: result1.replySent,
  });

  const reply1 = sentEmails[0]?.body || '';
  console.log('\n[Turn 1 Reply Verification]:');
  console.log('- "Thanks for following up" present:', /thanks for following up/i.test(reply1));
  console.log('- "additional details" present:', /additional details/i.test(reply1));
  console.log('- Acknowledges clothing/website:', /clothing|website/i.test(reply1));
  console.log('- Acknowledges ₹20,000 budget:', /20[,.]?000|budget/i.test(reply1));
  console.log('- Acknowledges December target:', /december/i.test(reply1));
  console.log('- Explains what can be provided:', /provide|include|catalog|pages|core|responsive/i.test(reply1));

  if (/thanks for following up/i.test(reply1) || /additional details/i.test(reply1)) {
    throw new Error('FAILED Turn 1: Reply contains inappropriate "following up" or "additional details"');
  }

  // --------------------------------------------------------------------------
  // TURN 2: Same-Thread Follow-Up (online payments + 50 products)
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  TURN 2: SAME-THREAD FOLLOW-UP (Real Gemini Call)');
  console.log('================================================================');

  const msg2Id = `live-msg-2-${Date.now()}`;
  const email2: ParsedInboundEmail = {
    messageId: msg2Id,
    sender: senderEmail,
    recipient: recipientEmail,
    subject: 'Re: Website for clothing business',
    text: 'Actually, I also need online payments and around 50 products. Would that change the estimate?',
    timestamp: Date.now(),
    inReplyTo: msg1Id,
    references: msg1Id,
    metadata: {
      gmailMessageId: msg2Id,
      gmailThreadId: testThreadId,
      companyId: evores.id,
    },
  };

  const result2 = await processInboundEmail(email2, testProvider as any);
  console.log('\n[Turn 2 Result]:', {
    status: result2.status,
    classification: result2.classification,
    leadId: result2.leadId,
    replySent: result2.replySent,
  });

  const reply2 = sentEmails[1]?.body || '';
  console.log('\n[Turn 2 Reply Verification]:');
  console.log('- Addresses estimate impact:', /estimate|cost|price|budget|impact|additional/i.test(reply2));
  console.log('- Acknowledges payments / products:', /payment|products?|catalog/i.test(reply2));

  // --------------------------------------------------------------------------
  // TURN 3: Same-Thread Feature Additions (login + tracking)
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  TURN 3: SAME-THREAD FEATURE ADDITIONS (Real Gemini Call)');
  console.log('================================================================');

  const msg3Id = `live-msg-3-${Date.now()}`;
  const email3: ParsedInboundEmail = {
    messageId: msg3Id,
    sender: senderEmail,
    recipient: recipientEmail,
    subject: 'Re: Website for clothing business',
    text: 'I would also like customer login and order tracking. Can you include those?',
    timestamp: Date.now(),
    inReplyTo: msg2Id,
    references: `${msg1Id} ${msg2Id}`,
    metadata: {
      gmailMessageId: msg3Id,
      gmailThreadId: testThreadId,
      companyId: evores.id,
    },
  };

  const result3 = await processInboundEmail(email3, testProvider as any);
  console.log('\n[Turn 3 Result]:', {
    status: result3.status,
    classification: result3.classification,
    leadId: result3.leadId,
    replySent: result3.replySent,
  });

  const reply3 = sentEmails[2]?.body || '';
  console.log('\n[Turn 3 Reply Verification]:');
  console.log('- Acknowledges login / tracking:', /login|tracking|account/i.test(reply3));

  // --------------------------------------------------------------------------
  // TURN 4: Same-Thread Meeting Request (call on 29 September)
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  TURN 4: SAME-THREAD MEETING REQUEST (Real Gemini Call)');
  console.log('================================================================');

  const msg4Id = `live-msg-4-${Date.now()}`;
  const email4: ParsedInboundEmail = {
    messageId: msg4Id,
    sender: senderEmail,
    recipient: recipientEmail,
    subject: 'Re: Website for clothing business',
    text: 'Would 6 PM on 29 September work for a call?',
    timestamp: Date.now(),
    inReplyTo: msg3Id,
    references: `${msg1Id} ${msg2Id} ${msg3Id}`,
    metadata: {
      gmailMessageId: msg4Id,
      gmailThreadId: testThreadId,
      companyId: evores.id,
    },
  };

  const result4 = await processInboundEmail(email4, testProvider as any);
  console.log('\n[Turn 4 Result]:', {
    status: result4.status,
    classification: result4.classification,
    leadId: result4.leadId,
    replySent: result4.replySent,
  });

  const reply4 = sentEmails[3]?.body || '';
  console.log('\n[Turn 4 Reply Verification]:');
  console.log('- Acknowledges meeting/call:', /call|meet|time|schedule|6 PM|September/i.test(reply4));

  console.log('\n================================================================');
  console.log('  ALL 4 REAL TURNS PROCESSED SUCCESSFULLY VIA PRODUCTION PIPELINE!');
  console.log('================================================================\n');
}

runLiveGeminiE2E()
  .catch((err) => {
    console.error('FAILED Live E2E Gemini Test:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
