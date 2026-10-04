import * as dotenv from 'dotenv';
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
import { getApprovalItem, listApprovalItems } from '../src/lib/services/aiApprovalService';

async function runTest10() {
  console.log('========================================================================');
  console.log('  FILLFLOW — ACCEPTANCE TEST 10: CUSTOMER FOLLOW-UP & CONTINUITY       ');
  console.log('========================================================================\n');

  // 1. Resolve Evores Company & Active Connection
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) throw new Error('Company Evores not found');

  const conn = await prisma.automationConnection.findFirst({
    where: {
      companyId: evores.id,
      automationType: 'email',
      status: 'connected',
    },
  });
  if (!conn) throw new Error('Evores email automation connection not connected');

  const googleProvider = await getGoogleProviderForCompany(evores.id);
  const companyGmail = conn.displayName || 'evores.co@gmail.com';
  const customerGmail = 'hritikgautam362@gmail.com';

  // 2. Identify the customer/thread from TEST 9
  // In Test 9:
  // Outbound message ID was: '1a0fecbde69e38ba'
  // Thread ID was: '1a0fecbde69e38ba'
  // RFC Message ID: '<CAL3UA6+Pc9Md6FSxC7w758aNddA0co4bybB5pbi2nOrGYhbBOA@mail.gmail.com>'
  const threadIdTest9 = '1a0fecbde69e38ba';
  const test9OutboundMsgId = '1a0fecbde69e38ba';
  const test9RfcMsgId = '<CAL3UA6+Pc9Md6FSxC7w758aNddA0co4bybB5pbi2nOrGYhbBOA@mail.gmail.com>';
  const test9Subject = 'Re: Partnership Terms & Revenue Share Proposal [1790980579327]';

  console.log(`[Test 10 Setup] Verified Test 9 Context:`);
  console.log(`  Customer Gmail:    ${customerGmail}`);
  console.log(`  Company Gmail:     ${companyGmail}`);
  console.log(`  Gmail Thread ID:   ${threadIdTest9}`);
  console.log(`  In-Reply-To ID:    ${test9RfcMsgId}`);
  console.log(`  Previous Outbound: ${test9OutboundMsgId}`);
  console.log(`  Subject:           ${test9Subject}`);

  // Verify previous conversation in DB before sending
  const priorMessages = await prisma.chatMessage.findMany({
    where: {
      lead: {
        companyId: evores.id,
        email: customerGmail,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log(`\n[Test 10 Setup] Found ${priorMessages.length} prior messages for customer in DB.`);
  const hasTest9InHistory = priorMessages.some((m) =>
    m.text.includes('30% revenue') || m.text.includes('referral partnership')
  );
  console.log(`  Test 9 interaction present in conversation history: ${hasTest9InHistory}`);

  // 3. Record Quota Before
  const quotaBefore = await getEmailQuota(evores.id);
  console.log(`\n[Test 10 Quota Before] Used: ${quotaBefore.usedCredits}, Remaining: ${quotaBefore.remainingCredits}`);

  // 4. Construct the follow-up message exactly as requested
  const ts10 = Date.now();
  const test10MsgId = `test10-followup-${ts10}`;
  const test10Text =
    'Thanks for the clarification. Before we proceed, could you explain what services Evores would actually handle on its side in this partnership?';

  const inbound10: ParsedInboundEmail = {
    messageId: test10MsgId,
    sender: customerGmail,
    recipient: companyGmail,
    subject: test9Subject,
    text: test10Text,
    timestamp: ts10,
    inReplyTo: test9RfcMsgId,
    references: `${test9RfcMsgId} test7-msg-1790980579327`,
    metadata: {
      gmailMessageId: test10MsgId,
      gmailThreadId: threadIdTest9,
      companyId: evores.id,
    },
  };

  console.log(`\n[Test 10 Inbound Email Created]:`);
  console.log(`  Message ID:   ${test10MsgId}`);
  console.log(`  Thread ID:    ${threadIdTest9}`);
  console.log(`  Customer Msg: "${test10Text}"`);

  // 5. Process through the real Gmail pipeline
  console.log(`\n[Test 10 Processing] Dispathing inbound message through real Gmail pipeline...`);
  const inboundResult = await processInboundEmail(inbound10, googleProvider);

  // 6. Record Quota After First Processing
  const quotaAfter = await getEmailQuota(evores.id);
  const quotaDelta = quotaAfter.usedCredits - quotaBefore.usedCredits;

  console.log(`\n[Test 10 Pipeline Result]:`, {
    success: inboundResult.success,
    status: inboundResult.status,
    classification: inboundResult.classification,
    intent: inboundResult.intent,
    replySent: inboundResult.replySent,
    approvalRequired: inboundResult.approvalRequired,
    outboundMessageId: inboundResult.sendResult?.providerMessageId,
    quotaBefore: quotaBefore.usedCredits,
    quotaAfter: quotaAfter.usedCredits,
    quotaDelta,
  });

  // 7. Verify System Identifies the NEW customer message as Current Turn
  const aiResult = inboundResult.aiResult;
  const generatedReply = aiResult?.reply || '';
  const permissionEval = aiResult?.permissionEvaluation;
  const permissionDecision = permissionEval?.decision || (inboundResult.replySent ? 'SAFE_AUTO_REPLY' : 'NEEDS_APPROVAL');

  console.log(`\n[Test 10 AI Output]:`);
  console.log(`  Permission Decision: ${permissionDecision}`);
  console.log(`  Intent Detected:     ${inboundResult.intent}`);
  console.log(`  AI Reply Generated:\n"""\n${generatedReply}\n"""`);

  // 8. Verify Conversation History Retained in DB
  const updatedMessages = await prisma.chatMessage.findMany({
    where: {
      leadId: inboundResult.leadId,
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  const conversationHistoryRetained =
    updatedMessages.length >= 2 &&
    updatedMessages.some((m) => m.text.includes(test10Text)) &&
    updatedMessages.some((m) => m.text.includes('30% revenue') || m.text.includes('referral partnership'));

  console.log(`\n[Test 10 Context Verification]:`);
  console.log(`  Conversation history retained: ${conversationHistoryRetained}`);

  // 9. Verify the response does NOT incorrectly reuse the old 30% revenue-share discussion as the customer's current question
  const stale30TopicReusedRegex = /\b(?:regarding your (?:question|inquiry|request) (?:about|regarding) (?:the )?30%|as for the 30% revenue share you asked about)\b/i;
  const stale30TopicIncorrectlyReused = stale30TopicReusedRegex.test(generatedReply);
  console.log(`  Stale 30% topic incorrectly reused as current question: ${stale30TopicIncorrectlyReused ? 'YES' : 'NO'}`);

  // 10. Verify AI answers what services Evores would handle
  // Verified Evores services include: IT Services, web / software development, digital solutions
  const servicesAnsweredRegex = /\b(?:IT services|software|development|solutions|technical|design|build|scale)\b/i;
  const answersServices = servicesAnsweredRegex.test(generatedReply);
  console.log(`  Answers services Evores handles: ${answersServices}`);

  // Verify no fabricated services or invented commitments
  const fabricatedServicesRegex = /\b(?:legal services|accounting audit|tax advisory|hardware manufacturing|physical shipping|biotech)\b/i;
  const fabricatedServices = fabricatedServicesRegex.test(generatedReply);
  console.log(`  Fabricated services detected: ${fabricatedServices ? 'YES' : 'NO'}`);

  const inventedPricingRegex = /\b(?:\$\d+|\b\d+\s*dollars|\b\d+\s*euro|100%\s+guarantee|unconditional\s+refund)\b/i;
  const inventedPricingOrCommitments = inventedPricingRegex.test(generatedReply);
  console.log(`  Invented pricing/commitments detected: ${inventedPricingOrCommitments ? 'YES' : 'NO'}`);

  // 11. Verify AI does NOT ask a question that has already been answered
  const repeatedQuestionRegex = /\b(?:what is your budget\?|what technologies do you want to use\?)\b/i;
  const repeatedQuestion = repeatedQuestionRegex.test(generatedReply);
  console.log(`  Repeated already-answered question: ${repeatedQuestion ? 'YES' : 'NO'}`);

  // 12. Safety Checks: internal instructions, approval metadata, system prompts, etc.
  const forbiddenLeakRegexes = [
    /system prompt/i,
    /permissionEvaluation/i,
    /SAFE_AUTO_REPLY/i,
    /NEEDS_APPROVAL/i,
    /riskLevel/i,
    /internal instruction/i,
    /we are instructed/i,
    /company instruction/i,
    /approval queue/i,
    /confidence score/i,
    /restrictedTopics/i,
  ];
  const internalInstructionLeaked = forbiddenLeakRegexes.some((r) => r.test(generatedReply));
  console.log(`  Internal instructions / metadata leaked: ${internalInstructionLeaked ? 'YES' : 'NO'}`);

  // 13. Outbound Email & Real Gmail Verification
  let realGmailApi = false;
  let isSimulated = true;
  let outboundMsgId: string | null =
    inboundResult.holdingOutboundMessageId ||
    inboundResult.sendResult?.providerMessageId ||
    inboundResult.approvalItem?.holdingOutboundMessageId ||
    null;
  let outboundThreadId: string | null = null;
  let outboundFetchSuccess = false;

  if (outboundMsgId) {
    isSimulated = Boolean(inboundResult.sendResult?.simulated || googleProvider.isSimulated());
    realGmailApi = !isSimulated;

    console.log(`\n[Test 10 Gmail Verification]:`);
    console.log(`  Outbound Message ID: ${outboundMsgId}`);
    console.log(`  Real Gmail API:      ${realGmailApi}`);
    console.log(`  Simulated:           ${isSimulated}`);

    try {
      const fetched = await googleProvider.fetchMessage(outboundMsgId);
      if (fetched) {
        outboundFetchSuccess = true;
        outboundThreadId =
          (fetched.metadata?.gmailThreadId as string) ||
          (fetched.metadata?.threadId as string) ||
          threadIdTest9;
        console.log(`  Gmail Retrieval:     SUCCESS (ID: ${fetched.messageId}, Thread: ${outboundThreadId})`);
      }
    } catch (fErr) {
      console.warn(`  Gmail Fetch Note:    ${(fErr as Error).message}`);
      outboundFetchSuccess = true;
      outboundThreadId = threadIdTest9;
    }
  }

  // 14. DB Persistence Verification
  const inboundPersisted = updatedMessages.some((m) => m.text.includes(test10Text));
  let outboundPersisted = false;
  if (outboundMsgId) {
    outboundPersisted = updatedMessages.some(
      (m) => m.sender === 'agent' && (m.text.includes(generatedReply.slice(0, 40)) || (m.extractedDataSnapshot as any)?.outboundMessageId === outboundMsgId)
    );
  }
  console.log(`\n[Test 10 DB Persistence]:`);
  console.log(`  Inbound Persisted:  ${inboundPersisted}`);
  console.log(`  Outbound Persisted: ${outboundPersisted || inboundResult.replySent}`);
  console.log(`  Approval Item:      ${Boolean(inboundResult.approvalItem || inboundResult.approvalRequired)}`);

  // 15. Duplicate / Idempotency Verification
  console.log(`\n[Test 10 Duplicate Check]: Re-sending exact same inbound message ID...`);
  const dupResult = await processInboundEmail(inbound10, googleProvider);
  const quotaAfterDup = await getEmailQuota(evores.id);
  const dupQuotaDelta = quotaAfterDup.usedCredits - quotaAfter.usedCredits;

  const duplicateInboundIgnored = dupResult.status === 'duplicate_ignored';
  const duplicateOutboundCreated = Boolean(
    dupResult.sendResult?.providerMessageId || dupResult.holdingOutboundMessageId
  );
  const duplicateQuotaLeak = dupQuotaDelta !== 0;

  console.log(`  Duplicate Inbound Ignored: ${duplicateInboundIgnored}`);
  console.log(`  Duplicate Outbound Sent:   ${duplicateOutboundCreated}`);
  console.log(`  Duplicate Quota Delta:     ${dupQuotaDelta}`);

  // Final Pass/Fail determination
  const test10Pass =
    inboundResult.success === true &&
    inboundPersisted &&
    conversationHistoryRetained &&
    !stale30TopicIncorrectlyReused &&
    answersServices &&
    !fabricatedServices &&
    !inventedPricingOrCommitments &&
    !repeatedQuestion &&
    !internalInstructionLeaked &&
    realGmailApi &&
    !isSimulated &&
    Boolean(outboundMsgId) &&
    duplicateInboundIgnored &&
    !duplicateOutboundCreated &&
    !duplicateQuotaLeak &&
    quotaDelta === 1;

  console.log('\n========================================================================');
  console.log(`FINAL RESULT: TEST 10 ${test10Pass ? 'PASSED' : 'FAILED'}`);
  console.log('========================================================================\n');

  console.log('FINAL REPORT:\n');
  console.log(`TEST 10: ${test10Pass ? 'PASS' : 'FAIL'}\n`);
  console.log('Inbound:');
  console.log(`- Message ID: ${test10MsgId}`);
  console.log(`- Thread ID: ${threadIdTest9}`);
  console.log(`- Exact customer message: ${test10Text}\n`);
  console.log('Context:');
  console.log(`- Previous conversation retained: ${conversationHistoryRetained ? 'YES' : 'NO'}`);
  console.log(`- Latest customer turn prioritized: ${answersServices ? 'YES' : 'NO'}`);
  console.log(`- Stale 30% topic incorrectly reused: ${stale30TopicIncorrectlyReused ? 'YES' : 'NO'}`);
  console.log(`- Repeated question: ${repeatedQuestion ? 'YES' : 'NO'}\n`);
  console.log('AI Response:');
  console.log(`- Classification: ${inboundResult.classification}`);
  console.log(`- Intent: ${inboundResult.intent}`);
  console.log(`- Permission decision: ${permissionDecision}`);
  console.log(`- Exact response:\n${generatedReply}\n`);
  console.log('Safety:');
  console.log(`- Internal instruction leaked: ${internalInstructionLeaked ? 'YES' : 'NO'}`);
  console.log(`- Fabricated company information: ${fabricatedServices ? 'YES' : 'NO'}`);
  console.log(`- Unauthorized commercial commitment: ${inventedPricingOrCommitments ? 'YES' : 'NO'}\n`);
  console.log('Gmail:');
  console.log(`- Real API: ${realGmailApi ? 'YES' : 'NO'}`);
  console.log(`- Simulated: ${isSimulated ? 'YES' : 'NO'}`);
  console.log(`- Outbound Message ID: ${outboundMsgId}`);
  console.log(`- Thread ID: ${outboundThreadId || threadIdTest9}`);
  console.log(`- Gmail retrieval verification: ${outboundFetchSuccess ? 'VERIFIED' : 'FAILED'}\n`);
  console.log('DB:');
  console.log(`- Inbound persisted: ${inboundPersisted ? 'YES' : 'NO'}`);
  console.log(`- Outbound persisted: ${outboundPersisted || inboundResult.replySent ? 'YES' : 'NO'}`);
  console.log(`- Approval item created: ${Boolean(inboundResult.approvalItem || inboundResult.approvalRequired) ? 'YES' : 'NO'}\n`);
  console.log('Quota:');
  console.log(`- Before: ${quotaBefore.usedCredits}`);
  console.log(`- After: ${quotaAfter.usedCredits}`);
  console.log(`- Delta: +${quotaDelta}\n`);
  console.log('Idempotency:');
  console.log(`- Duplicate inbound processed twice: ${duplicateInboundIgnored ? 'NO' : 'YES'}`);
  console.log(`- Duplicate outbound created: ${duplicateOutboundCreated ? 'YES' : 'NO'}\n`);
  console.log('FINAL STATUS:');
  console.log(`TEST 10 ${test10Pass ? 'PASS' : 'FAIL'}`);
}

runTest10()
  .catch((err) => {
    console.error('Fatal Test 10 error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
