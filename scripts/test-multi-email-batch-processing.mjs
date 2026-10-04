/**
 * Comprehensive Multi-Email Batch Processing Regression Test Suite
 *
 * Tests cases A through H as specified in prompt:
 * A. 3 genuine inquiries -> 3 replies
 * B. 5 messages (inquiry, inquiry, newsletter, advertisement, inquiry) -> 3 replies, 2 skipped, 0 silently dropped
 * C. First email succeeds, second fails -> first reply succeeds, second failure isolated, third email still processed
 * D. Multiple different threads -> each processed independently
 * E. Multiple messages in same customer thread -> context preserved without duplicate reply
 * F. Quota: 100 limit, 3 genuine emails -> 3 credits consumed
 * G. Quota: 2 remaining credits, 3 genuine emails -> 2 replies, 1 quota-locked, NO batch termination
 * H. Duplicate message IDs -> duplicate skipped, other unique messages still processed
 *
 * Mocks Gemini to avoid live rate limits and burns.
 */

import { prisma } from '../src/lib/prisma.js';
import { AutomationType, ConnectionStatus, LeadStatus, MessageSender } from '@prisma/client';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
  isMessageAlreadyProcessed,
} from '../src/lib/services/email/emailInboundService.js';
import {
  setGeminiMockHandler,
  clearGeminiMockHandler,
  getRealGeminiCallCount,
  resetRealGeminiCallCount,
} from '../src/lib/ai/gemini.js';
import {
  setAiClassifierMockHandler,
  clearAiClassifierMockHandler,
} from '../src/lib/services/email/emailClassifier.js';
import {
  reserveEmailQuota,
  commitEmailQuota,
  releaseEmailQuota,
  getEmailQuota,
} from '../src/lib/services/emailQuotaService.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  passedTests++;
}

class MockBatchEmailProvider {
  constructor(companyId, connectedEmail) {
    this.companyId = companyId;
    this.connectedEmail = connectedEmail;
    this.sentMessages = [];
    this.readMessages = new Set();
    this.failOnMessageIds = new Set();
  }

  async sendMessage(params) {
    const msgId = params.metadata?.incomingGmailMessageId;
    if (msgId && this.failOnMessageIds.has(msgId)) {
      return {
        success: false,
        error: 'Simulated Gmail SMTP transmission failure',
      };
    }

    const providerMessageId = `mock-outbound-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.sentMessages.push({
      to: params.to,
      subject: params.subject,
      text: params.text,
      inReplyTo: params.inReplyTo,
      references: params.references,
      providerMessageId,
      incomingMessageId: msgId,
    });

    return {
      success: true,
      providerMessageId,
      threadId: params.metadata?.gmailThreadId,
    };
  }

  async markAsRead(messageId) {
    this.readMessages.add(messageId);
  }

  async hasOutboundReply(threadId, incomingMessageId) {
    return this.sentMessages.some((m) => m.incomingMessageId === incomingMessageId);
  }
}

async function runBatch(messages, provider, companyId) {
  const processedResults = [];

  for (const item of messages) {
    try {
      const alreadyProcessed = await isMessageAlreadyProcessed(
        item.messageId,
        item.messageId,
        companyId,
        provider,
        item.metadata?.gmailThreadId
      );

      if (alreadyProcessed) {
        if (provider.markAsRead) {
          await provider.markAsRead(item.messageId).catch(() => {});
        }
        processedResults.push({
          messageId: item.messageId,
          status: 'duplicate_ignored',
          skipped: true,
          replySent: false,
        });
        continue;
      }

      // Ensure explicit companyId
      item.metadata = {
        ...(item.metadata || {}),
        companyId,
      };

      const result = await processInboundEmail(item, provider);
      processedResults.push({
        messageId: item.messageId,
        status: result.status,
        classification: result.classification,
        leadId: result.leadId,
        briefCreated: result.briefCreated,
        replySent: Boolean(result.replySent),
        skipped:
          result.status === 'skipped_irrelevant' ||
          result.status === 'duplicate_ignored' ||
          result.replySent === false,
      });
    } catch (procErr) {
      processedResults.push({
        messageId: item.messageId,
        status: 'error',
        errorMessage: procErr.message,
        replySent: false,
        skipped: false,
      });
    }
  }

  const checkedCount = messages.length;
  const repliedCount = processedResults.filter((r) => r.status === 'processed' && r.replySent === true).length;
  const skippedCount = processedResults.filter(
    (r) =>
      r.skipped === true ||
      r.status === 'duplicate_ignored' ||
      r.status === 'skipped_irrelevant' ||
      (r.status === 'processed' && r.replySent === false)
  ).length;
  const failedCount = processedResults.filter(
    (r) => r.status === 'error' || r.status === 'quota_locked' || r.status === 'automation_disabled'
  ).length;

  return {
    checked: checkedCount,
    replied: repliedCount,
    skipped: skippedCount,
    failed: failedCount,
    processed: processedResults,
  };
}

async function main() {
  console.log('=== MULTI-EMAIL BATCH PROCESSING REGRESSION SUITE ===\n');
  resetRealGeminiCallCount();

  // Install test mocks for Gemini to protect quota
  setGeminiMockHandler((params) => {
    const isFollowUp = params.history && params.history.length > 0;
    const question = isFollowUp
      ? 'What core features and specific integrations are most essential for your project?'
      : 'Could you share what specific requirements or timeline you have in mind?';

    return {
      reply: `We would be happy to assist you with your request regarding "${params.latestMessage.replace(/["\n\r]/g, ' ').substring(0, 40)}". ${question}\n\nBest regards,\nCustomer Support Team`,
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: true,
      nextBestQuestion: question,
      extractedRequirements: {
        qualificationScore: isFollowUp ? 75 : 40,
        projectType: 'General Inquiry',
        budget: isFollowUp ? '$30,000' : undefined,
        timeline: isFollowUp ? '2 months' : undefined,
        features: [],
        techStack: [],
        missingFields: isFollowUp ? [] : ['timeline'],
        readyForBrief: false,
      },
      options: isFollowUp ? ['Portal access', 'API integration'] : ['Within 1 month', '1-3 months', 'Flexible'],
    };
  });

  // Create isolated test company
  const suffix = Date.now();
  const testCompany = await prisma.company.create({
    data: {
      name: `Batch Test Corp ${suffix}`,
      industry: 'technology and consulting',
    },
  });
  const companyId = testCompany.id;
  const connectedEmail = `company-${suffix}@testdomain.com`;

  // Create active automation connection
  await prisma.automationConnection.create({
    data: {
      companyId,
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      displayName: connectedEmail,
      provider: 'google',
      metadata: {
        googleEmail: connectedEmail,
        processedEmailIds: {},
      },
    },
  });

  // Create active automation access with 100 limit
  await prisma.automationAccess.create({
    data: {
      companyId,
      automationType: AutomationType.email,
      enabled: true,
      monthlyLimit: 100,
      usedCredits: 0,
      reservedCredits: 0,
      quotaLocked: false,
      adminDisabled: false,
    },
  });

  try {
    // =========================================================================
    // TEST A: 3 Genuine Inquiries -> 3 Replies
    // =========================================================================
    console.log('\n--- Running Test A: 3 Genuine Inquiries ---');
    clearEmailIdCacheForTesting();
    const providerA = new MockBatchEmailProvider(companyId, connectedEmail);

    const batchA = [
      {
        messageId: `msg-A1-${suffix}`,
        sender: `alice-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry: what services do you provide?',
        text: 'Hi, what services do you provide?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-A1-${suffix}`, gmailThreadId: `thread-A1-${suffix}` },
      },
      {
        messageId: `msg-A2-${suffix}`,
        sender: `bob-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Partnership Inquiry',
        text: "Hi, we'd like to discuss a partnership with your company.",
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-A2-${suffix}`, gmailThreadId: `thread-A2-${suffix}` },
      },
      {
        messageId: `msg-A3-${suffix}`,
        sender: `charlie-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Price quotation inquiry',
        text: "Hi, I'm interested in getting a quotation for your services.",
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-A3-${suffix}`, gmailThreadId: `thread-A3-${suffix}` },
      },
    ];

    const resultA = await runBatch(batchA, providerA, companyId);
    assert(resultA.checked === 3, 'Test A: 3 checked');
    assert(resultA.replied === 3, 'Test A: 3 replied');
    assert(resultA.skipped === 0, 'Test A: 0 skipped');
    assert(resultA.failed === 0, 'Test A: 0 failed');
    assert(providerA.sentMessages.length === 3, 'Test A: 3 outbound replies sent via provider');

    const quotaA = await getEmailQuota(companyId);
    assert(quotaA.usedCredits === 3, `Test A: Quota usedCredits is 3 (actual: ${quotaA.usedCredits})`);
    assert(quotaA.reservedCredits === 0, `Test A: Quota reservedCredits is 0 (actual: ${quotaA.reservedCredits})`);

    // =========================================================================
    // TEST B: 5 Messages (3 inquiries, 1 newsletter, 1 ad) -> 3 replied, 2 skipped
    // =========================================================================
    console.log('\n--- Running Test B: 5 Messages (3 Inquiries + 2 Non-Inquiries) ---');
    clearEmailIdCacheForTesting();
    const providerB = new MockBatchEmailProvider(companyId, connectedEmail);

    const batchB = [
      {
        messageId: `msg-B1-${suffix}`,
        sender: `client1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Software project inquiry',
        text: 'Hello, we need someone to build a customer portal web app for our business.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-B1-${suffix}`, gmailThreadId: `thread-B1-${suffix}` },
      },
      {
        messageId: `msg-B2-${suffix}`,
        sender: `client2-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Can we schedule a meeting?',
        text: 'Can we arrange a meeting to discuss your software engineering services?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-B2-${suffix}`, gmailThreadId: `thread-B2-${suffix}` },
      },
      {
        messageId: `msg-B3-${suffix}`,
        sender: `newsletter@weeklytechdigest.com`,
        recipient: connectedEmail,
        subject: 'Weekly Tech Digest #42',
        text: 'Here is your weekly digest of technology news. Click unsubscribe to opt out.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-B3-${suffix}`, gmailThreadId: `thread-B3-${suffix}` },
      },
      {
        messageId: `msg-B4-${suffix}`,
        sender: `marketing@promo-blast.com`,
        recipient: connectedEmail,
        subject: '50% off all office supplies today only!',
        text: 'Get huge discounts now. Limited time offer!',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-B4-${suffix}`, gmailThreadId: `thread-B4-${suffix}` },
      },
      {
        messageId: `msg-B5-${suffix}`,
        sender: `client3-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'How much do your services cost?',
        text: 'Hi, how much do you charge for your services?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-B5-${suffix}`, gmailThreadId: `thread-B5-${suffix}` },
      },
    ];

    const resultB = await runBatch(batchB, providerB, companyId);
    assert(resultB.checked === 5, 'Test B: 5 checked');
    assert(resultB.replied === 3, 'Test B: 3 replied');
    assert(resultB.skipped === 2, 'Test B: 2 skipped (newsletter + ad)');
    assert(resultB.failed === 0, 'Test B: 0 failed');
    assert(providerB.sentMessages.length === 3, 'Test B: Exactly 3 replies sent');

    const quotaB = await getEmailQuota(companyId);
    assert(quotaB.usedCredits === 6, `Test B: Quota usedCredits is 6 (actual: ${quotaB.usedCredits})`);
    assert(quotaB.reservedCredits === 0, `Test B: Quota reservedCredits is 0`);

    // =========================================================================
    // TEST C: Failure Isolation (Email 1 succeeds, Email 2 fails to send, Email 3 succeeds)
    // =========================================================================
    console.log('\n--- Running Test C: Failure Isolation ---');
    clearEmailIdCacheForTesting();
    const providerC = new MockBatchEmailProvider(companyId, connectedEmail);
    providerC.failOnMessageIds.add(`msg-C2-${suffix}`); // Simulate send failure on second email

    const batchC = [
      {
        messageId: `msg-C1-${suffix}`,
        sender: `inquiry1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'What services do you provide?',
        text: 'What services do you provide to clients?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-C1-${suffix}`, gmailThreadId: `thread-C1-${suffix}` },
      },
      {
        messageId: `msg-C2-${suffix}`,
        sender: `inquiry2-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Need help with a project',
        text: 'We need help with our project, can someone call me?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-C2-${suffix}`, gmailThreadId: `thread-C2-${suffix}` },
      },
      {
        messageId: `msg-C3-${suffix}`,
        sender: `inquiry3-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Quotation request',
        text: 'Please send a quotation for your services.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-C3-${suffix}`, gmailThreadId: `thread-C3-${suffix}` },
      },
    ];

    const resultC = await runBatch(batchC, providerC, companyId);
    assert(resultC.checked === 3, 'Test C: 3 checked');
    assert(resultC.replied === 2, 'Test C: 2 replied (C1 and C3)');
    assert(resultC.failed === 1, 'Test C: 1 failed (C2 failed send)');
    assert(resultC.processed[1].status === 'error', 'Test C: C2 recorded as error');
    assert(resultC.processed[2].status === 'processed', 'Test C: C3 still processed after C2 failure');

    const quotaC = await getEmailQuota(companyId);
    assert(quotaC.usedCredits === 8, `Test C: Quota usedCredits is 8 (only 2 consumed, actual: ${quotaC.usedCredits})`);
    assert(quotaC.reservedCredits === 0, `Test C: Quota reservedCredits returned to 0 (C2 released reservation)`);

    // =========================================================================
    // TEST D: Multiple Different Threads Processed Independently
    // =========================================================================
    console.log('\n--- Running Test D: Multiple Different Threads ---');
    clearEmailIdCacheForTesting();
    const providerD = new MockBatchEmailProvider(companyId, connectedEmail);

    const batchD = [
      {
        messageId: `msg-D1-${suffix}`,
        sender: `thread1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Thread 1 Inquiry',
        text: 'What services does your company provide?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-D1-${suffix}`, gmailThreadId: `thread-D1-${suffix}` },
      },
      {
        messageId: `msg-D2-${suffix}`,
        sender: `thread2-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Thread 2 Inquiry',
        text: 'We want to discuss a partnership with your company.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-D2-${suffix}`, gmailThreadId: `thread-D2-${suffix}` },
      },
    ];

    const resultD = await runBatch(batchD, providerD, companyId);
    assert(resultD.replied === 2, 'Test D: Both independent threads replied');
    assert(
      resultD.processed[0].leadId !== resultD.processed[1].leadId,
      'Test D: Independent threads mapped to distinct leads'
    );

    // =========================================================================
    // TEST E: Multiple Messages in Same Customer Thread (Follow-up Continuity)
    // =========================================================================
    console.log('\n--- Running Test E: Same Thread Continuity ---');
    clearEmailIdCacheForTesting();
    const providerE = new MockBatchEmailProvider(companyId, connectedEmail);
    const sharedThreadId = `thread-E-shared-${suffix}`;
    const clientEmailE = `thread-client-${suffix}@example.com`;

    // First message in thread
    const batchE1 = [
      {
        messageId: `msg-E1-${suffix}`,
        sender: clientEmailE,
        recipient: connectedEmail,
        subject: 'Initial project inquiry',
        text: 'Can you provide a quotation for custom software?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-E1-${suffix}`, gmailThreadId: sharedThreadId },
      },
    ];
    const resE1 = await runBatch(batchE1, providerE, companyId);
    assert(resE1.replied === 1, 'Test E: Initial inquiry replied');

    // Follow-up message in same thread from customer
    const batchE2 = [
      {
        messageId: `msg-E2-${suffix}`,
        sender: clientEmailE,
        recipient: connectedEmail,
        subject: 'Re: Initial project inquiry',
        text: 'We would need it launched within 2 months and budget is $30,000.',
        inReplyTo: `msg-E1-${suffix}`,
        references: `msg-E1-${suffix}`,
        timestamp: Date.now() + 1000,
        metadata: { gmailMessageId: `msg-E2-${suffix}`, gmailThreadId: sharedThreadId },
      },
    ];
    const resE2 = await runBatch(batchE2, providerE, companyId);
    assert(resE2.replied === 1, 'Test E: Follow-up email in same thread processed and replied');
    assert(resE2.processed[0].leadId === resE1.processed[0].leadId, 'Test E: Same Lead maintained across thread');

    // =========================================================================
    // TEST F: Quota: 100 limit, 3 genuine emails -> 3 credits consumed
    // =========================================================================
    console.log('\n--- Running Test F: Quota Consumption ---');
    clearEmailIdCacheForTesting();
    // Reset quota for company to 0 used
    await prisma.automationAccess.update({
      where: { companyId_automationType: { companyId, automationType: AutomationType.email } },
      data: { usedCredits: 0, reservedCredits: 0, quotaLocked: false },
    });

    const providerF = new MockBatchEmailProvider(companyId, connectedEmail);
    const batchF = [
      {
        messageId: `msg-F1-${suffix}`,
        sender: `f1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 1',
        text: 'What services do you provide?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-F1-${suffix}`, gmailThreadId: `thread-F1-${suffix}` },
      },
      {
        messageId: `msg-F2-${suffix}`,
        sender: `f2-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 2',
        text: 'Can we schedule a meeting regarding services?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-F2-${suffix}`, gmailThreadId: `thread-F2-${suffix}` },
      },
      {
        messageId: `msg-F3-${suffix}`,
        sender: `f3-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 3',
        text: 'How much does your service cost?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-F3-${suffix}`, gmailThreadId: `thread-F3-${suffix}` },
      },
    ];

    const resF = await runBatch(batchF, providerF, companyId);
    assert(resF.replied === 3, 'Test F: 3 inquiries replied');
    const quotaF = await getEmailQuota(companyId);
    assert(quotaF.usedCredits === 3, `Test F: Exactly 3 credits consumed (actual: ${quotaF.usedCredits})`);
    assert(quotaF.remainingCredits === 97, `Test F: Exactly 97 credits remaining (actual: ${quotaF.remainingCredits})`);
    assert(quotaF.reservedCredits === 0, `Test F: 0 reserved credits`);

    // =========================================================================
    // TEST G: Quota: 2 remaining credits, 3 genuine emails -> 2 replies, 1 quota-locked, NO batch termination
    // =========================================================================
    console.log('\n--- Running Test G: Quota Exhaustion Boundary ---');
    clearEmailIdCacheForTesting();
    // Set company to 98 used out of 100 (2 remaining)
    await prisma.automationAccess.update({
      where: { companyId_automationType: { companyId, automationType: AutomationType.email } },
      data: { usedCredits: 98, reservedCredits: 0, quotaLocked: false },
    });

    const providerG = new MockBatchEmailProvider(companyId, connectedEmail);
    const batchG = [
      {
        messageId: `msg-G1-${suffix}`,
        sender: `g1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 1',
        text: 'What services do you offer?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-G1-${suffix}`, gmailThreadId: `thread-G1-${suffix}` },
      },
      {
        messageId: `msg-G2-${suffix}`,
        sender: `g2-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 2',
        text: 'We want to discuss a partnership with your company.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-G2-${suffix}`, gmailThreadId: `thread-G2-${suffix}` },
      },
      {
        messageId: `msg-G3-${suffix}`,
        sender: `g3-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry 3',
        text: 'Interested in getting a quotation for your services.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-G3-${suffix}`, gmailThreadId: `thread-G3-${suffix}` },
      },
    ];

    const resG = await runBatch(batchG, providerG, companyId);
    assert(resG.checked === 3, 'Test G: All 3 checked without premature loop termination');
    assert(resG.replied === 2, `Test G: 2 replied (actual: ${resG.replied})`);
    assert(resG.failed === 1, `Test G: 1 failed due to quota limit (actual: ${resG.failed})`);
    assert(resG.processed[2].status === 'quota_locked', 'Test G: 3rd email marked quota_locked');

    const quotaG = await getEmailQuota(companyId);
    assert(quotaG.usedCredits === 100, `Test G: 100 credits used (limit reached)`);
    assert(quotaG.remainingCredits === 0, `Test G: 0 credits remaining`);
    assert(quotaG.quotaLocked === true, `Test G: workspace quotaLocked is true`);

    // =========================================================================
    // TEST H: Duplicate Message IDs -> duplicate skipped, unique processed
    // =========================================================================
    console.log('\n--- Running Test H: Duplicate Handling ---');
    clearEmailIdCacheForTesting();
    // Unlock quota
    await prisma.automationAccess.update({
      where: { companyId_automationType: { companyId, automationType: AutomationType.email } },
      data: { usedCredits: 0, reservedCredits: 0, quotaLocked: false },
    });

    const providerH = new MockBatchEmailProvider(companyId, connectedEmail);
    const sharedMsgId = `msg-H-duplicate-${suffix}`;

    const batchH = [
      {
        messageId: sharedMsgId,
        sender: `h1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry H1',
        text: 'What services do you provide?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: sharedMsgId, gmailThreadId: `thread-H1-${suffix}` },
      },
      {
        messageId: sharedMsgId, // Exact duplicate of first
        sender: `h1-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry H1 Duplicate',
        text: 'What services do you provide?',
        timestamp: Date.now(),
        metadata: { gmailMessageId: sharedMsgId, gmailThreadId: `thread-H1-${suffix}` },
      },
      {
        messageId: `msg-H3-${suffix}`, // Unique third message
        sender: `h3-${suffix}@client.com`,
        recipient: connectedEmail,
        subject: 'Inquiry H3 Unique',
        text: 'Interested in getting a quotation for your services.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-H3-${suffix}`, gmailThreadId: `thread-H3-${suffix}` },
      },
    ];

    const resH = await runBatch(batchH, providerH, companyId);
    assert(resH.checked === 3, 'Test H: 3 checked');
    assert(resH.replied === 2, `Test H: 2 replied (unique H1 and unique H3)`);
    assert(resH.skipped === 1, `Test H: 1 skipped (duplicate H1 skipped)`);
    assert(resH.processed[1].status === 'duplicate_ignored', 'Test H: Second item identified as duplicate_ignored');

    console.log('\n==================================================');
    console.log(`ALL 8 REGRESSION CASES PASSED (${passedTests}/${totalTests} assertions)!`);
    console.log(`REAL_GEMINI_CALLS = ${getRealGeminiCallCount()}`);
    console.log('==================================================');
  } finally {
    clearGeminiMockHandler();
    clearAiClassifierMockHandler();
    // Cleanup test company
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
