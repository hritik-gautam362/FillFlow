import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma';
import { getGoogleProviderForCompany } from '../src/lib/services/email/emailProviderFactory';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService';
import { getEmailQuota } from '../src/lib/services/emailQuotaService';
import { ParsedInboundEmail } from '../src/lib/services/email/EmailProvider';

async function main() {
  console.log('================================================================');
  console.log('STARTING REAL GMAIL END-TO-END VERIFICATION: NEWEST QUESTION OVERRIDES OLD CONTEXT');
  console.log('================================================================\n');

  // 1. Resolve Evores Company & Gmail connection
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) {
    throw new Error('Evores company not found');
  }

  const conn = await prisma.automationConnection.findFirst({
    where: {
      companyId: evores.id,
      automationType: 'email',
      status: 'connected',
    },
  });
  if (!conn) {
    throw new Error('Evores email automation connection is not connected');
  }

  const googleProvider = await getGoogleProviderForCompany(evores.id);
  const recipientEmail = conn.displayName || 'evores.co@gmail.com';
  const customerEmail = 'hritikgautam362@gmail.com';

  // 2. Measure Quota Before
  const quotaBefore = await getEmailQuota(evores.id);
  console.log(`[Quota Before] Used: ${quotaBefore.usedCredits}, Remaining: ${quotaBefore.remainingCredits}`);

  // 3. Define the exact test message in the existing active thread
  // Existing thread from the real failure
  const existingThreadId = '1a0cfb9e1d74653e';
  const uniqueTimestamp = Date.now();
  const newGmailMsgId = `gmail-msg-verify-${uniqueTimestamp}`;
  const newCustomerQuestion = "Thanks. Before we schedule it, could you tell me whether you also work with agencies outside India?";
  const subject = "Re: busi";

  const inboundEmail: ParsedInboundEmail = {
    messageId: newGmailMsgId,
    sender: customerEmail,
    recipient: recipientEmail,
    subject,
    text: newCustomerQuestion,
    timestamp: uniqueTimestamp,
    inReplyTo: '<CAL3UA6JhE+5EKwoRVFWye6ndcxxmzMNGQpMux-jXRY-S6HqvPA@mail.gmail.com>',
    references: '<CAL3UA6JhE+5EKwoRVFWye6ndcxxmzMNGQpMux-jXRY-S6HqvPA@mail.gmail.com>',
    metadata: {
      gmailMessageId: newGmailMsgId,
      gmailThreadId: existingThreadId,
      companyId: evores.id,
    },
  };

  console.log(`\n[Real Test Inbound Message]`);
  console.log(`  New Gmail Message ID: ${newGmailMsgId}`);
  console.log(`  Existing Thread ID:   ${existingThreadId}`);
  console.log(`  From (Customer):      ${customerEmail}`);
  console.log(`  To (Mailbox):         ${recipientEmail}`);
  console.log(`  Subject:              ${subject}`);
  console.log(`  Newest Message Body:  "${newCustomerQuestion}"\n`);

  // 4. Execute the complete production pipeline
  console.log('[Executing processInboundEmail via real production pipeline]...');
  const inboundResult = await processInboundEmail(inboundEmail, googleProvider);

  console.log('\n[Pipeline Result]:', {
    success: inboundResult.success,
    status: inboundResult.status,
    classification: inboundResult.classification,
    intent: inboundResult.intent,
    replySent: inboundResult.replySent,
    leadId: inboundResult.leadId,
    outboundMessageId: inboundResult.sendResult?.providerMessageId,
    errorMessage: inboundResult.errorMessage,
  });

  // 5. Measure Quota After
  const quotaAfter = await getEmailQuota(evores.id);
  console.log(`[Quota After] Used: ${quotaAfter.usedCredits}, Remaining: ${quotaAfter.remainingCredits}`);

  // 6. Inspect Outbound Message Created in ChatMessage Table
  let outboundChatMsg = null;
  if (inboundResult.leadId) {
    outboundChatMsg = await prisma.chatMessage.findFirst({
      where: {
        leadId: inboundResult.leadId,
        sender: 'agent',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  const finalResponseText = outboundChatMsg?.text || inboundResult.aiResult?.reply || '';
  console.log(`\n[Final Response Sent]:\n${finalResponseText}\n`);

  // 7. Verify Idempotency - deliver the same Gmail message ID again
  console.log('[Testing Duplicate Delivery Idempotency with same Gmail Message ID]...');
  const duplicateResult = await processInboundEmail(inboundEmail, googleProvider);
  console.log(`[Duplicate Delivery Result]:`, {
    success: duplicateResult.success,
    status: duplicateResult.status,
    errorCategory: duplicateResult.errorCategory,
  });

  const quotaAfterDuplicate = await getEmailQuota(evores.id);
  console.log(`[Quota After Duplicate] Used: ${quotaAfterDuplicate.usedCredits}, Remaining: ${quotaAfterDuplicate.remainingCredits}`);

  // 8. Assertions for Production Verification
  const lowerResponse = finalResponseText.toLowerCase();

  const answersAgencyQuestion =
    lowerResponse.includes('agencies outside india') ||
    lowerResponse.includes('outside india') ||
    lowerResponse.includes('international') ||
    lowerResponse.includes('globally') ||
    lowerResponse.includes('overseas') ||
    lowerResponse.includes('partner');

  const doesNotAskTimezone = !lowerResponse.includes('confirm your timezone');
  const currentWonOverOldContext = answersAgencyQuestion && doesNotAskTimezone;

  console.log('\n============================================================');
  console.log('VERIFICATION CHECKS:');
  console.log(`  1. Inbound Success:                  ${inboundResult.success ? 'PASS' : 'FAIL'}`);
  console.log(`  2. Real Outbound Reply Sent:         ${inboundResult.replySent ? 'PASS' : 'FAIL'}`);
  console.log(`  3. Quota Increment (+1):             ${quotaAfter.usedCredits === quotaBefore.usedCredits + 1 ? 'PASS' : 'FAIL'}`);
  console.log(`  4. Answers Current Agency Question:  ${answersAgencyQuestion ? 'PASS' : 'FAIL'}`);
  console.log(`  5. Does NOT Ask For Timezone:        ${doesNotAskTimezone ? 'PASS' : 'FAIL'}`);
  console.log(`  6. Current Won Over Old Context:     ${currentWonOverOldContext ? 'PASS' : 'FAIL'}`);
  console.log(`  7. Duplicate Delivery Ignored:       ${duplicateResult.status === 'duplicate_ignored' ? 'PASS' : 'FAIL'}`);
  console.log(`  8. Quota Idempotent On Duplicate:    ${quotaAfterDuplicate.usedCredits === quotaAfter.usedCredits ? 'PASS' : 'FAIL'}`);
  console.log('============================================================\n');

  if (!inboundResult.success || !inboundResult.replySent) {
    console.error('❌ Real Gmail verification failed: outbound reply was not sent.');
    process.exit(1);
  }

  if (!currentWonOverOldContext) {
    console.error('❌ Real Gmail verification failed: response answered old context instead of the new question.');
    process.exit(1);
  }

  if (quotaAfter.usedCredits !== quotaBefore.usedCredits + 1) {
    console.error(`❌ Quota did not increment by exactly 1: before=${quotaBefore.usedCredits}, after=${quotaAfter.usedCredits}`);
    process.exit(1);
  }

  if (duplicateResult.status !== 'duplicate_ignored') {
    console.error(`❌ Duplicate delivery was not ignored: got ${duplicateResult.status}`);
    process.exit(1);
  }

  if (quotaAfterDuplicate.usedCredits !== quotaAfter.usedCredits) {
    console.error(`❌ Quota leaked on duplicate message: after=${quotaAfter.usedCredits}, afterDuplicate=${quotaAfterDuplicate.usedCredits}`);
    process.exit(1);
  }

  console.log('🎉 REAL GMAIL VERIFICATION COMPLETED WITH 100% SUCCESS!');
}

main()
  .catch((err) => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
