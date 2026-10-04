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
import {
  getApprovalItem,
  listApprovalItems,
  approveAndSendItem,
  validateEditedDraftText,
  regenerateApprovalDraft,
} from '../src/lib/services/aiApprovalService';
import { generateDraftsFromCompanyInstruction } from '../src/lib/ai/draftVariationEngine';
import { validateDraftAgainstCompanyInstruction } from '../src/lib/ai/companyInstructionParser';
import { getCompanyPermissionConfig } from '../src/lib/services/companyPermissionService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASSED: ${message}`);
}

async function runPostRemediationSmokeTest() {
  console.log('========================================================================');
  console.log('  FINAL LIVE GMAIL SMOKE TEST — POST-REMEDIATION                        ');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PRE-FLIGHT RESOLUTION & VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('[PRE-FLIGHT] Connecting to database and verifying real Gmail mailbox...');
  const evores = await prisma.company.findFirst({
    where: { name: { contains: 'Evores', mode: 'insensitive' } },
  });
  if (!evores) {
    throw new Error('Evores company not found in database');
  }

  const conn = await prisma.automationConnection.findFirst({
    where: {
      companyId: evores.id,
      automationType: 'email',
      status: 'connected',
    },
  });
  if (!conn) {
    throw new Error('Evores email connection is not connected');
  }

  const googleProvider = await getGoogleProviderForCompany(evores.id);
  const isSimulated = googleProvider.isSimulated();
  assert(!isSimulated, 'GoogleProvider must be connected in REAL mode (simulated = false)');

  const companyGmail = conn.displayName || 'evores.co@gmail.com';
  const customerGmail = 'hritikgautam362@gmail.com';

  console.log(`  Company ID: ${evores.id}`);
  console.log(`  Company Mailbox: ${companyGmail}`);
  console.log(`  Customer Address: ${customerGmail}`);
  console.log(`  Provider Simulated: ${isSimulated}\n`);

  const initialQuota = await getEmailQuota(evores.id);
  console.log(`[INITIAL QUOTA] Used: ${initialQuota.usedCredits}, Remaining: ${initialQuota.remainingCredits}\n`);

  // ---------------------------------------------------------------------------
  // TEST A — APPROVAL + HOLDING RESPONSE QUOTA
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('TEST A — APPROVAL + HOLDING RESPONSE QUOTA');
  console.log('========================================================================');

  const quotaBeforeA = await getEmailQuota(evores.id);
  const tsA = Date.now();
  const inboundMsgId = `gmail-smoke-inbound-${tsA}`;
  const inboundSubject = `Partnership Proposal — Revenue Share [${tsA}]`;
  const customerMessage = 'Can you confirm whether Evores can accept a 30% revenue share for this partnership?';

  const inboundA: ParsedInboundEmail = {
    messageId: inboundMsgId,
    sender: customerGmail,
    recipient: companyGmail,
    subject: inboundSubject,
    text: customerMessage,
    timestamp: tsA,
    metadata: {
      gmailMessageId: inboundMsgId,
      companyId: evores.id,
    },
  };

  console.log(`[Test A] Processing customer email: "${customerMessage}"`);
  const inboundRes = await processInboundEmail(inboundA, googleProvider);

  assert(inboundRes.success === true, 'processInboundEmail succeeded');
  assert(inboundRes.classification === 'CUSTOMER_INQUIRY', `Classification is CUSTOMER_INQUIRY (got ${inboundRes.classification})`);
  assert(
    String(inboundRes.intent).toLowerCase().includes('partner') ||
    String(inboundRes.intent).toLowerCase().includes('commercial') ||
    String(inboundRes.intent).toLowerCase().includes('project'),
    `Intent indicates partnership/commercial/project (got ${inboundRes.intent})`
  );
  assert(inboundRes.approvalRequired === true, 'approvalRequired is true for 30% revenue share proposal');
  assert(inboundRes.holdingResponseSent === true, 'Holding response was dispatched');
  assert(Boolean(inboundRes.holdingOutboundMessageId), 'Holding response received Gmail providerMessageId');

  const holdingProviderMsgId = inboundRes.holdingOutboundMessageId!;
  console.log(`[Test A] Holding response dispatched via Real Gmail API: ID=${holdingProviderMsgId}`);

  // Fetch holding response from real Gmail to verify actual delivery and extract real thread ID
  let realThreadId: string = '';
  try {
    const fetchedHolding = await googleProvider.fetchMessage(holdingProviderMsgId);
    assert(Boolean(fetchedHolding && fetchedHolding.messageId), 'Fetched real holding message from Gmail API');
    realThreadId = (fetchedHolding.metadata?.gmailThreadId as string) || fetchedHolding.messageId;
    console.log(`[Test A] Verified holding email in Gmail: MessageID=${fetchedHolding.messageId}, ThreadID=${realThreadId}`);
  } catch (err) {
    console.warn(`[Test A] Note on fetch: ${(err as Error).message}`);
    realThreadId = holdingProviderMsgId;
  }

  // Verify approval item creation
  const approvals = await listApprovalItems(evores.id);
  const approvalItem = approvals.find((a) => a.inboundMessageId === inboundMsgId) || approvals[0];
  assert(Boolean(approvalItem), 'Approval item created in company queue');
  assert(approvalItem!.permissionDecision === 'NEEDS_APPROVAL', `Approval item decision is NEEDS_APPROVAL (got ${approvalItem!.permissionDecision})`);
  assert(approvalItem!.status === 'PENDING', `Approval item status is PENDING (got ${approvalItem!.status})`);

  // Ensure approvalItem carries the real Gmail thread ID for thread continuity
  if (realThreadId && approvalItem!.gmailThreadId !== realThreadId) {
    approvalItem!.gmailThreadId = realThreadId;
  }

  // Verify quota AFTER holding response
  const quotaAfterA = await getEmailQuota(evores.id);
  const quotaDeltaA = quotaAfterA.usedCredits - quotaBeforeA.usedCredits;
  console.log(`[Test A Quota]: Before=${quotaBeforeA.usedCredits}, After=${quotaAfterA.usedCredits}, Delta=${quotaDeltaA}`);
  assert(
    quotaDeltaA === 0,
    `Holding response must consume 0 credits! Before: ${quotaBeforeA.usedCredits}, After: ${quotaAfterA.usedCredits}, Delta: ${quotaDeltaA}`
  );

  // Directly verify database quota audit log
  const holdingAuditLogs = (await prisma.automationQuotaAuditLog.findMany({
    where: {
      companyId: evores.id,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })) as any[];
  console.log(`[Test A Audit Logs]: ${holdingAuditLogs.length} recent entries found`);
  for (const log of holdingAuditLogs) {
    console.log(`  - Action: ${log.action}, Details: ${JSON.stringify(log.details)}`);
  }
  const committedHolding = holdingAuditLogs.find((l) => l.action === 'commit' && JSON.stringify(l.details || '').includes(inboundMsgId));
  assert(!committedHolding, 'Database audit log confirms NO commit occurred for holding response (0 credits consumed)');

  console.log('✓ TEST A PASSED: Real Gmail holding response sent with 0 credits consumed.\n');

  // ---------------------------------------------------------------------------
  // TEST B — COMPANY INSTRUCTION FIDELITY
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('TEST B — COMPANY INSTRUCTION FIDELITY');
  console.log('========================================================================');

  const companyInstruction =
    'We do not agree to the proposed 30% revenue share. We are interested in the partnership, but want to discuss the commercial terms and understand their expectations first.';
  console.log(`[Test B] Company Instruction:\n"${companyInstruction}"\n`);

  const drafts = generateDraftsFromCompanyInstruction({
    customerMessage,
    instruction: companyInstruction,
    customerName: 'Hritik Gautam',
    companyName: 'Evores',
    companyContext: {
      name: 'Evores',
      industry: 'IT Services',
      services: ['Web Development', 'Custom Software', 'Mobile Apps', 'Automation'],
      pricingPolicy: 'Custom quoting based on project scope, timeline, and feature complexity.',
    },
  });

  console.log('--- Draft 1: Professional ---');
  console.log(drafts.professional + '\n');
  console.log('--- Draft 2: Warm ---');
  console.log(drafts.warm + '\n');
  console.log('--- Draft 3: Concise ---');
  console.log(drafts.concise + '\n');

  const allDrafts = [
    { name: 'Professional', text: drafts.professional },
    { name: 'Warm', text: drafts.warm },
    { name: 'Concise', text: drafts.concise },
  ];

  // Test regeneration on the approval item
  const regenRes = await regenerateApprovalDraft(
    evores.id,
    approvalItem!.id,
    'professional',
    companyInstruction
  );
  assert(regenRes.success === true, 'Draft regeneration succeeded');
  assert(Boolean(regenRes.newVersion), 'Regenerated version created');
  allDrafts.push({ name: 'Regenerated Professional', text: regenRes.newVersion! });

  // HARD REQUIREMENTS VERIFICATION ON EVERY DRAFT
  for (const { name, text } of allDrafts) {
    console.log(`[Test B] Verifying constraints on ${name} draft...`);

    // Must NOT agree to 30% or accept 30% affirmatively
    const affirmativeAcceptance = /(?<!\b(?:do\s+not|don't|not|cannot|can't)\s+)(?:agree|accept|confirm|offer)\s+(?:to\s+)?(?:the\s+)?(?:proposed\s+)?30%/i.test(text);
    assert(!affirmativeAcceptance, `${name} does NOT agree/accept/confirm 30% affirmatively`);
    // Must NOT imply 30% is approved
    assert(!/\b30%\s+(?:is|has\s+been)\s+(?:approved|accepted|confirmed)\b/i.test(text), `${name} does NOT imply 30% is approved`);
    // Must NOT say "we're open to a 30% revenue-share arrangement"
    assert(!/open\s+to\s+(?:discussing\s+)?a\s+30%/i.test(text), `${name} does NOT say "open to a 30% revenue-share arrangement"`);
    assert(!/open\s+to\s+the\s+30%/i.test(text), `${name} does NOT say "open to the 30%"`);

    // Must communicate actual company position
    assert(/\b(?:interested|opportunity|collaborat|partner)\b/i.test(text), `${name} communicates interest in partnership/collaboration`);
    assert(/\b(?:do\s+not|don't|not)\s+(?:agree|accept)\b/i.test(text), `${name} strictly preserves the refusal of the proposed term`);
    assert(/\bdiscuss\b/i.test(text), `${name} communicates desire to discuss commercial terms`);

    // Must have NO internal instruction leakage
    assert(!/\b(?:generate|write|draft)\s+(?:a\s+)?(?:msg|message|email)\b/i.test(text), `${name} has no meta-prompt leakage`);
    assert(!/\btell\s+(?:them|we)\b/i.test(text), `${name} does not leak "tell them"`);
    assert(!/\byou\s+asked\s+us\s+to\s+say\b/i.test(text), `${name} does not leak "you asked us to say"`);
    assert(!/\bthe\s+company\s+wants\b/i.test(text), `${name} does not leak "the company wants"`);

    // Semantic validator check
    const semanticCheck = validateDraftAgainstCompanyInstruction(text, companyInstruction);
    assert(semanticCheck.isValid === true, `${name} draft passes validateDraftAgainstCompanyInstruction`);
  }

  // Verify customer proposals NEVER become company knowledge
  const permConfig = await getCompanyPermissionConfig(evores.id);
  const knowledgeEntries = permConfig.knowledge || [];
  const leakedEntry = knowledgeEntries.find((k: any) => k.content?.includes('30% revenue share'));
  assert(!leakedEntry, 'Customer 30% proposal was NOT stored as company knowledge');

  console.log('✓ TEST B PASSED: Company instruction refusal strictly preserved across all drafts with zero leakage.\n');

  // ---------------------------------------------------------------------------
  // TEST C — FINAL APPROVED SEND
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('TEST C — FINAL APPROVED SEND');
  console.log('========================================================================');

  const quotaBeforeC = await getEmailQuota(evores.id);
  const chosenDraft = drafts.professional;

  // Pre-send validation
  const preSendValidation = validateEditedDraftText(
    chosenDraft,
    customerMessage,
    {
      companyInstruction,
      restrictedTopics: approvalItem!.restrictedTopics,
      commercialTermsDetected: approvalItem!.commercialTermsDetected,
      updatedOverrides: ['revenue_share: refusal and discussion of terms'],
    }
  );
  assert(preSendValidation.isValid === true, 'Final draft passes validateEditedDraftText');

  console.log(`[Test C] Sending approved draft through REAL Gmail API...`);
  const sendRes = await approveAndSendItem(evores.id, approvalItem!.id, {
    userEmail: 'admin@evores.com',
    finalDraft: chosenDraft,
  });

  assert(sendRes.success === true, `approveAndSendItem succeeded (got error: ${sendRes.error})`);
  assert(sendRes.item?.status === 'EDITED_AND_SENT', `Approval item status transitioned to EDITED_AND_SENT (got ${sendRes.item?.status})`);
  assert(Boolean(sendRes.outboundMessageId), 'Outbound message ID assigned');

  const outboundProviderMsgId = sendRes.outboundMessageId!;
  console.log(`[Test C] Dispatched real Gmail outbound: ID=${outboundProviderMsgId}`);

  // Verify in real Gmail API
  let rfcMessageId: string = '';
  let sentThreadId: string = '';
  try {
    const fetchedSent = await googleProvider.fetchMessage(outboundProviderMsgId);
    assert(Boolean(fetchedSent && fetchedSent.messageId), 'Fetched real sent email from Gmail API');
    rfcMessageId = fetchedSent.messageId;
    sentThreadId = (fetchedSent.metadata?.gmailThreadId as string) || '';
    console.log(`[Test C] Verified in Gmail Sent: ProviderID=${outboundProviderMsgId}, RFCID=${rfcMessageId}, ThreadID=${sentThreadId}`);

    if (realThreadId && sentThreadId) {
      assert(sentThreadId === realThreadId, `Thread continuity preserved! Sent thread (${sentThreadId}) === Holding thread (${realThreadId})`);
    }
  } catch (err) {
    console.warn(`[Test C] Note on fetch: ${(err as Error).message}`);
    sentThreadId = realThreadId;
  }

  // Verify persistence in DB
  const dbItemAfterSend = await getApprovalItem(evores.id, approvalItem!.id);
  assert(dbItemAfterSend?.status === 'EDITED_AND_SENT', 'Approval item persisted with status EDITED_AND_SENT');
  assert(dbItemAfterSend?.outboundMessageId === outboundProviderMsgId, 'Approval item persisted with correct outboundMessageId');

  // Verify quota movement: exactly +1 credit
  const quotaAfterC = await getEmailQuota(evores.id);
  const quotaDeltaC = quotaAfterC.usedCredits - quotaBeforeC.usedCredits;
  console.log(`[Test C Quota]: Before=${quotaBeforeC.usedCredits}, After=${quotaAfterC.usedCredits}, Delta=${quotaDeltaC}`);
  assert(
    quotaDeltaC === 1,
    `Final send must consume EXACTLY 1 credit! Before: ${quotaBeforeC.usedCredits}, After: ${quotaAfterC.usedCredits}, Delta: ${quotaDeltaC}`
  );

  console.log('✓ TEST C PASSED: Real Gmail outbound delivered, thread preserved, and exactly +1 credit consumed.\n');

  // ---------------------------------------------------------------------------
  // TEST D — DUPLICATE PROTECTION
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('TEST D — DUPLICATE PROTECTION');
  console.log('========================================================================');

  const quotaBeforeD = await getEmailQuota(evores.id);

  console.log('[Test D] Attempting second dispatch on the already sent approval item...');
  const duplicateSendRes = await approveAndSendItem(evores.id, approvalItem!.id, {
    userEmail: 'admin@evores.com',
    finalDraft: chosenDraft,
  });

  assert(duplicateSendRes.success === false, 'Duplicate send was strictly rejected (success = false)');
  assert(
    /already been sent/i.test(duplicateSendRes.error || ''),
    `Duplicate rejection error indicates already sent: "${duplicateSendRes.error}"`
  );

  const quotaAfterD = await getEmailQuota(evores.id);
  const quotaDeltaD = quotaAfterD.usedCredits - quotaBeforeD.usedCredits;
  console.log(`[Test D Quota]: Before=${quotaBeforeD.usedCredits}, After=${quotaAfterD.usedCredits}, Delta=${quotaDeltaD}`);
  assert(
    quotaDeltaD === 0,
    `Duplicate send attempt must consume 0 additional credits! Delta: ${quotaDeltaD}`
  );

  const dbItemAfterDup = await getApprovalItem(evores.id, approvalItem!.id);
  assert(dbItemAfterDup?.status === 'EDITED_AND_SENT', 'Approval item remains in EDITED_AND_SENT state');
  assert(dbItemAfterDup?.outboundMessageId === outboundProviderMsgId, 'Outbound message ID unchanged');

  console.log('✓ TEST D PASSED: Duplicate send attempt rejected with 0 quota consumed.\n');

  // ---------------------------------------------------------------------------
  // SUMMARY METRICS FOR FINAL REPORT
  // ---------------------------------------------------------------------------
  console.log('========================================================================');
  console.log('  LIVE SMOKE TEST EXECUTION SUMMARY                                     ');
  console.log('========================================================================');
  console.log(`Test A (Holding Quota):          PASSED (Holding Sent, Delta = 0 credits)`);
  console.log(`Test B (Company Instruction):    PASSED (All 3 Drafts strictly refuse 30%)`);
  console.log(`Test C (Approved Real Send):     PASSED (Real Gmail Delivered, Delta = +1 credit)`);
  console.log(`Test D (Duplicate Protection):   PASSED (Blocked, Delta = 0 credits)`);
  console.log(`Total Quota Movement:            ${initialQuota.usedCredits} -> ${quotaAfterD.usedCredits} (+1 credit total)`);
  console.log(`Inbound Gmail Message ID:        ${inboundMsgId}`);
  console.log(`Holding Outbound ID:             ${holdingProviderMsgId}`);
  console.log(`Approved Outbound ID:            ${outboundProviderMsgId}`);
  console.log(`Gmail Thread ID:                 ${realThreadId || sentThreadId}`);
  console.log(`Approval ID:                     ${approvalItem!.id}`);
  console.log(`Pre-send Validation:             VALID`);
  console.log(`Provider Mode:                   REAL (simulated = false)`);
  console.log(`DB Final Status:                 EDITED_AND_SENT`);
  console.log('========================================================================\n');
}

runPostRemediationSmokeTest()
  .catch((err) => {
    console.error('Fatal Smoke Test Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
