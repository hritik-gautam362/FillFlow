/**
 * scripts/test-quota-ux-behavior.mjs
 *
 * Dedicated Verification Suite for Gmail AI Quota UX and Behavior:
 * 1. Admin configures monthlyLimit = 3
 * 2. Company does NOT manually reserve credits
 * 3. Successful replies automatically consume exactly 1 used credit
 * 4. AI failure: usedCredits unchanged (reservation released)
 * 5. Gmail send failure: usedCredits unchanged (reservation released)
 * 6. Duplicate email: usedCredits unchanged
 * 7. Irrelevant/promotional/courtesy email: usedCredits unchanged
 * 8. Reaching limit: automatically transitions to QUOTA_LOCKED, stops replies (0 AI calls, 0 sends)
 * 9. Monthly reset: usedCredits resets to 0 and transitions back to ACTIVE
 * 10. Concurrency safety: atomic reservations prevent exceeding monthlyLimit
 * 11. Tenant isolation: Company A's quota does not impact Company B
 * 12. Detailed report output
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService.ts';
import {
  getEmailQuota,
  updateMonthlyLimit,
  checkAndResetMonthlyQuotaIfNeeded,
  resetCompanyEmailQuota,
  setAdminAutomationDisabled,
} from '../src/lib/services/emailQuotaService.ts';
import {
  setGeminiMockHandler,
  clearGeminiMockHandler,
  getRealGeminiCallCount,
  resetRealGeminiCallCount,
} from '../src/lib/ai/gemini.ts';
import {
  setAiClassifierMockHandler,
  clearAiClassifierMockHandler,
} from '../src/lib/services/email/emailClassifier.ts';

let passedCount = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    console.log(`  ✓ PASSED: ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

class TestMockGmailProvider {
  constructor(companyId, connectedEmail) {
    this.companyId = companyId;
    this.connectedEmail = connectedEmail;
    this.sentMessages = [];
    this.readMessages = new Set();
    this.failOnMessageIds = new Set();
  }

  async getValidAccessToken() {
    return 'simulated-access-token';
  }

  async sendMessage(params) {
    const incomingId = params.metadata?.incomingGmailMessageId;
    if (incomingId && this.failOnMessageIds.has(incomingId)) {
      return {
        success: false,
        error: 'Simulated Gmail SMTP transmission failure (550 Mailbox Unavailable)',
      };
    }

    const providerMessageId = `mock-gmail-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.sentMessages.push({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      inReplyTo: params.inReplyTo,
      references: params.references,
      providerMessageId,
      incomingMessageId: incomingId,
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

async function cleanupCompany(companyId) {
  await prisma.automationQuotaAuditLog.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.chatMessage.deleteMany({ where: { lead: { companyId } } }).catch(() => {});
  await prisma.lead.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.automationAccess.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.automationConnection.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
}

async function main() {
  console.log('\n========================================================================');
  console.log('  STARTING GMAIL AI QUOTA UX & BEHAVIOR VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  resetRealGeminiCallCount();

  const timestamp = Date.now();
  const companyAId = `test-quota-a-${timestamp}`;
  const companyBId = `test-quota-b-${timestamp}`;
  const connectedEmailA = `sales-${timestamp}@companya.com`;
  const connectedEmailB = `hello-${timestamp}@companyb.com`;

  // Tracking metrics for final report
  let reportedConfiguredLimit = 0;
  let reportedUsed = 0;
  let reportedRemaining = 0;
  let reportedSuccessfulReplies = 0;
  let reportedBlockedEmails = 0;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create isolated test companies
    // -------------------------------------------------------------------------
    await cleanupCompany(companyAId);
    await cleanupCompany(companyBId);

    await prisma.company.create({
      data: {
        id: companyAId,
        name: 'Apex AI Software Corp',
        industry: 'Software Engineering',
      },
    });

    await prisma.company.create({
      data: {
        id: companyBId,
        name: 'Beacon Logistics Group',
        industry: 'Logistics',
      },
    });

    // Active Gmail connection for Company A
    await prisma.automationConnection.create({
      data: {
        companyId: companyAId,
        automationType: AutomationType.email,
        provider: 'google',
        status: ConnectionStatus.connected,
        displayName: connectedEmailA,
        metadata: { googleEmail: connectedEmailA },
      },
    });

    // Active Gmail connection for Company B
    await prisma.automationConnection.create({
      data: {
        companyId: companyBId,
        automationType: AutomationType.email,
        provider: 'google',
        status: ConnectionStatus.connected,
        displayName: connectedEmailB,
        metadata: { googleEmail: connectedEmailB },
      },
    });

    // Mock AI classifier to ensure fast, deterministic tests without burning Gemini rate-limits
    setAiClassifierMockHandler((inbound) => {
      const subject = (inbound.subject || '').toLowerCase();
      const text = (inbound.text || '').toLowerCase();
      if (subject.includes('sale') || subject.includes('discount') || text.includes('discount')) {
        return {
          classification: 'PROMOTIONAL',
          category: 'promotional',
          intent: 'promotional_offer',
          confidence: 0.99,
          reason: 'Promotional marketing email detected',
          requiresReply: false,
          deterministic: true,
        };
      }
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        intent: 'project_request',
        confidence: 0.95,
        reason: 'Genuine project or service inquiry detected',
        requiresReply: true,
        deterministic: true,
      };
    });

    // Standard Mock Gemini Agent response
    const standardMockOutput = (params) => ({
      reply: `Thank you for contacting us regarding "${params.latestMessage}". We specialize in this domain and would love to assist. What is your estimated timeline?`,
      requiresReply: true,
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      options: ['Within 2 weeks', 'Next month', 'Flexible'],
      extractedRequirements: {
        qualificationScore: 80,
        projectType: 'custom_software',
        description: params.latestMessage,
        techStack: ['React', 'Node.js'],
        features: ['Core System'],
        missingFields: [],
        readyForBrief: true,
      },
    });

    setGeminiMockHandler(standardMockOutput);

    const providerA = new TestMockGmailProvider(companyAId, connectedEmailA);
    const providerB = new TestMockGmailProvider(companyBId, connectedEmailB);

    // =========================================================================
    // STEP 1: Admin sets the monthly limit = 3
    // =========================================================================
    console.log('[Step 1] Admin sets monthly limit = 3');
    const initialQuota = await updateMonthlyLimit(companyAId, 3);
    reportedConfiguredLimit = initialQuota.monthlyLimit;

    assert(initialQuota.monthlyLimit === 3, 'Configured monthlyLimit is 3');
    assert(initialQuota.usedCredits === 0, 'Initial usedCredits is 0');
    assert(initialQuota.remainingCredits === 3, 'Initial remainingCredits is 3');
    assert(initialQuota.automationStatus === 'ACTIVE', 'Initial status is ACTIVE');
    assert(initialQuota.quotaLocked === false, 'Initial quotaLocked is false');

    // =========================================================================
    // STEP 2: Email A -> successfully replied -> Used 1/3
    // =========================================================================
    console.log('\n[Step 2] Email A: Genuine Inquiry -> reply sent -> Used 1/3');
    clearEmailIdCacheForTesting();
    const emailA = {
      messageId: `msg-a-${timestamp}`,
      sender: `client-a-${timestamp}@enterprise.com`,
      recipient: connectedEmailA,
      subject: 'Inquiry: Custom Cloud Database Architecture',
      text: 'Hello, we would like to engage your team for custom cloud database architecture and migration.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-a-${timestamp}`,
        gmailThreadId: `thread-a-${timestamp}`,
      },
    };

    const resA = await processInboundEmail(emailA, providerA);
    assert(resA.success === true, 'Email A processed successfully');
    assert(resA.status === 'processed', 'Email A status is processed');
    assert(resA.replySent === true, 'Email A generated outbound reply');
    reportedSuccessfulReplies++;

    const quotaAfterA = await getEmailQuota(companyAId);
    assert(quotaAfterA.usedCredits === 1, `Email A usedCredits is 1 (actual: ${quotaAfterA.usedCredits})`);
    assert(quotaAfterA.remainingCredits === 2, `Email A remainingCredits is 2 (actual: ${quotaAfterA.remainingCredits})`);
    assert(quotaAfterA.automationStatus === 'ACTIVE', 'Email A status remains ACTIVE');

    // =========================================================================
    // STEP 3: Email B -> successfully replied -> Used 2/3
    // =========================================================================
    console.log('\n[Step 3] Email B: Genuine Inquiry -> reply sent -> Used 2/3');
    clearEmailIdCacheForTesting();
    const emailB = {
      messageId: `msg-b-${timestamp}`,
      sender: `client-b-${timestamp}@startup.io`,
      recipient: connectedEmailA,
      subject: 'Mobile App Discovery RFP',
      text: 'Hi Apex AI team, we need a quote for an iOS and Android mobile app development project.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-b-${timestamp}`,
        gmailThreadId: `thread-b-${timestamp}`,
      },
    };

    const resB = await processInboundEmail(emailB, providerA);
    assert(resB.success === true, 'Email B processed successfully');
    assert(resB.replySent === true, 'Email B generated outbound reply');
    reportedSuccessfulReplies++;

    const quotaAfterB = await getEmailQuota(companyAId);
    assert(quotaAfterB.usedCredits === 2, `Email B usedCredits is 2 (actual: ${quotaAfterB.usedCredits})`);
    assert(quotaAfterB.remainingCredits === 1, `Email B remainingCredits is 1 (actual: ${quotaAfterB.remainingCredits})`);
    assert(quotaAfterB.automationStatus === 'ACTIVE', 'Email B status remains ACTIVE');

    // =========================================================================
    // STEP 4: Email C -> successfully replied -> Used 3/3 -> transitions to QUOTA_LOCKED
    // =========================================================================
    console.log('\n[Step 4] Email C: Final Credit Inquiry -> reply sent -> Used 3/3 -> QUOTA_LOCKED');
    clearEmailIdCacheForTesting();
    const emailC = {
      messageId: `msg-c-${timestamp}`,
      sender: `client-c-${timestamp}@venture.org`,
      recipient: connectedEmailA,
      subject: 'Security Audit & Compliance Consultation',
      text: 'Good morning, we are seeking automated security audits for our SaaS platform.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-c-${timestamp}`,
        gmailThreadId: `thread-c-${timestamp}`,
      },
    };

    const resC = await processInboundEmail(emailC, providerA);
    assert(resC.success === true, 'Email C processed successfully');
    assert(resC.replySent === true, 'Email C generated outbound reply');
    reportedSuccessfulReplies++;

    const quotaAfterC = await getEmailQuota(companyAId);
    assert(quotaAfterC.usedCredits === 3, `Email C usedCredits reached 3 (actual: ${quotaAfterC.usedCredits})`);
    assert(quotaAfterC.remainingCredits === 0, `Email C remainingCredits is 0 (actual: ${quotaAfterC.remainingCredits})`);
    assert(quotaAfterC.automationStatus === 'QUOTA_LOCKED', 'Automation status automatically locked to QUOTA_LOCKED');
    assert(quotaAfterC.quotaLocked === true, 'Database quotaLocked flag is true');

    // =========================================================================
    // STEP 5: Email D -> automatically blocked -> 0 AI calls and 0 Gmail sends
    // =========================================================================
    console.log('\n[Step 5] Email D: Arrives While Quota Locked -> Blocked with 0 AI and 0 sends');
    clearEmailIdCacheForTesting();
    const sentMessagesCountBeforeD = providerA.sentMessages.length;

    // Track if mock handler gets called for email D
    let aiCalledForEmailD = false;
    const currentMockHandler = (params) => {
      if (params.latestMessage.includes('Urgent E-Commerce Integration Request')) {
        aiCalledForEmailD = true;
      }
      return {
        reply: 'Should never be called',
        requiresReply: true,
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      };
    };
    setGeminiMockHandler(currentMockHandler);

    const emailD = {
      messageId: `msg-d-${timestamp}`,
      sender: `client-d-${timestamp}@retailer.com`,
      recipient: connectedEmailA,
      subject: 'Urgent E-Commerce Integration Request',
      text: 'We need an e-commerce integration right away. Please send proposal.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-d-${timestamp}`,
        gmailThreadId: `thread-d-${timestamp}`,
      },
    };

    const resD = await processInboundEmail(emailD, providerA);
    assert(resD.success === false, 'Email D processing stopped (not sent)');
    assert(resD.status === 'quota_locked', 'Email D status is quota_locked');
    assert(aiCalledForEmailD === false, 'Zero AI calls made for Email D');
    assert(providerA.sentMessages.length === sentMessagesCountBeforeD, 'Zero Gmail sends executed for Email D');
    reportedBlockedEmails++;

    const quotaAfterD = await getEmailQuota(companyAId);
    assert(quotaAfterD.usedCredits === 3, 'Used credits remain exactly 3');
    assert(quotaAfterD.remainingCredits === 0, 'Remaining credits remain 0');

    // Reset mock handler
    setGeminiMockHandler(standardMockOutput);

    // =========================================================================
    // STEP 6: Duplicate email: usedCredits unchanged
    // =========================================================================
    console.log('\n[Step 6] Duplicate email arrives -> ignored as duplicate, usedCredits unchanged');
    clearEmailIdCacheForTesting();
    // Simulate duplicate delivery of Email A
    const resDuplicate = await processInboundEmail(emailA, providerA);
    assert(resDuplicate.status === 'duplicate_ignored', 'Duplicate correctly identified as duplicate_ignored');
    assert(providerA.sentMessages.length === sentMessagesCountBeforeD, 'Zero additional replies sent for duplicate');

    const quotaAfterDup = await getEmailQuota(companyAId);
    assert(quotaAfterDup.usedCredits === 3, 'Used credits remain exactly 3 after duplicate');

    // =========================================================================
    // STEP 7: Irrelevant / promotional / courtesy email: usedCredits unchanged
    // =========================================================================
    console.log('\n[Step 7] Irrelevant/promotional/courtesy email arrives -> usedCredits unchanged');
    clearEmailIdCacheForTesting();
    const promotionalEmail = {
      messageId: `msg-promo-${timestamp}`,
      sender: 'newsletter@marketingdeal.com',
      recipient: connectedEmailA,
      subject: 'Super Sale: 70% off Cloud Servers this week only!',
      text: 'Click here to claim your massive discount on dedicated servers today!',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-promo-${timestamp}`,
        gmailThreadId: `thread-promo-${timestamp}`,
      },
    };

    const resPromo = await processInboundEmail(promotionalEmail, providerA);
    assert(resPromo.status === 'skipped_irrelevant', 'Promotional email skipped as irrelevant');
    assert(resPromo.replySent !== true, 'Zero reply sent for promotional email');

    const quotaAfterPromo = await getEmailQuota(companyAId);
    assert(quotaAfterPromo.usedCredits === 3, 'Used credits remain unchanged after promotional email');

    // =========================================================================
    // STEP 8: AI failure: usedCredits unchanged (internal reservation released)
    // =========================================================================
    console.log('\n[Step 8] AI failure scenario -> internal reservation released -> usedCredits unchanged');
    clearEmailIdCacheForTesting();
    // Temporarily grant 1 additional credit to test processing failure
    await updateMonthlyLimit(companyAId, 4);
    const quotaBeforeAiFail = await getEmailQuota(companyAId);
    assert(quotaBeforeAiFail.remainingCredits === 1, 'Temporary 1 remaining credit available');
    assert(quotaBeforeAiFail.automationStatus === 'ACTIVE', 'Company unlocked to ACTIVE with new limit');

    const emailAiFail = {
      messageId: `msg-aifail-${timestamp}`,
      sender: `client-aifail-${timestamp}@test.com`,
      recipient: connectedEmailA,
      subject: 'Client inquiry requiring AI generation',
      text: 'Can you help us build a customized workflow automation software?',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-aifail-${timestamp}`,
        gmailThreadId: `thread-aifail-${timestamp}`,
        simulateAiError: true, // triggers artificial AI error in discovery
      },
    };

    const resAiFail = await processInboundEmail(emailAiFail, providerA);
    assert(resAiFail.status === 'error', 'Processing resulted in error status');

    const quotaAfterAiFail = await getEmailQuota(companyAId);
    assert(quotaAfterAiFail.usedCredits === 3, `usedCredits remained unchanged at 3 (actual: ${quotaAfterAiFail.usedCredits})`);
    assert(quotaAfterAiFail.remainingCredits === 1, `remainingCredits restored to 1 (actual: ${quotaAfterAiFail.remainingCredits})`);

    // =========================================================================
    // STEP 9: Gmail send failure: usedCredits unchanged (reservation released)
    // =========================================================================
    console.log('\n[Step 9] Gmail send failure scenario -> internal reservation released -> usedCredits unchanged');
    clearEmailIdCacheForTesting();
    const emailSendFail = {
      messageId: `msg-sendfail-${timestamp}`,
      sender: `client-sendfail-${timestamp}@test.com`,
      recipient: connectedEmailA,
      subject: 'Client inquiry requiring Gmail reply',
      text: 'We are looking for an AI consultation partner for our enterprise project.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-sendfail-${timestamp}`,
        gmailThreadId: `thread-sendfail-${timestamp}`,
      },
    };

    // Instruct mock provider to simulate SMTP/Gmail send failure on this message
    providerA.failOnMessageIds.add(`msg-sendfail-${timestamp}`);

    const resSendFail = await processInboundEmail(emailSendFail, providerA);
    assert(resSendFail.status === 'error', 'Send failure resulted in error status');

    const quotaAfterSendFail = await getEmailQuota(companyAId);
    assert(quotaAfterSendFail.usedCredits === 3, `usedCredits remained unchanged at 3 (actual: ${quotaAfterSendFail.usedCredits})`);
    assert(quotaAfterSendFail.remainingCredits === 1, `remainingCredits restored to 1 (actual: ${quotaAfterSendFail.remainingCredits})`);

    // =========================================================================
    // STEP 10: Concurrency safety: atomic reservations prevent exceeding limit
    // =========================================================================
    console.log('\n[Step 10] Concurrency safety: multiple concurrent emails competing for final credit');
    clearEmailIdCacheForTesting();
    // Exactly 1 credit remains (3 used of 4). Send 5 concurrent requests
    const concurrentEmails = [1, 2, 3, 4, 5].map((idx) => ({
      messageId: `msg-concurrent-${idx}-${timestamp}`,
      sender: `concurrent-${idx}-${timestamp}@clients.com`,
      recipient: connectedEmailA,
      subject: `Concurrent Inquiry ${idx}`,
      text: `Inquiry ${idx} for custom AI integration services.`,
      timestamp: Date.now() + idx,
      metadata: {
        companyId: companyAId,
        gmailMessageId: `msg-concurrent-${idx}-${timestamp}`,
        gmailThreadId: `thread-concurrent-${idx}-${timestamp}`,
      },
    }));

    const concurrentResults = await Promise.all(
      concurrentEmails.map((email) => processInboundEmail(email, providerA))
    );

    const successfulConcurrent = concurrentResults.filter((r) => r.replySent === true);
    const blockedConcurrent = concurrentResults.filter((r) => r.status === 'quota_locked');

    assert(successfulConcurrent.length === 1, `Exactly 1 concurrent request succeeded (actual: ${successfulConcurrent.length})`);
    assert(blockedConcurrent.length === 4, `Remaining 4 concurrent requests were quota locked (actual: ${blockedConcurrent.length})`);
    reportedSuccessfulReplies += successfulConcurrent.length;
    reportedBlockedEmails += blockedConcurrent.length;

    const quotaAfterConcurrent = await getEmailQuota(companyAId);
    assert(quotaAfterConcurrent.usedCredits === 4, `usedCredits exactly reaches limit 4 without exceeding (actual: ${quotaAfterConcurrent.usedCredits})`);
    assert(quotaAfterConcurrent.remainingCredits === 0, 'remainingCredits is 0');
    assert(quotaAfterConcurrent.automationStatus === 'QUOTA_LOCKED', 'Company locked at limit');

    // =========================================================================
    // STEP 11: Tenant Isolation: Company A at limit does not block Company B
    // =========================================================================
    console.log('\n[Step 11] Multi-tenant isolation: Company A locked does not affect Company B');
    clearEmailIdCacheForTesting();
    // Configure Company B with limit = 100
    await updateMonthlyLimit(companyBId, 100);
    const emailCompanyB = {
      messageId: `msg-comp-b-${timestamp}`,
      sender: `client-b-${timestamp}@logistics.com`,
      recipient: connectedEmailB,
      subject: 'Fleet Routing Optimization Inquiry',
      text: 'We are requesting quotation for fleet routing AI software.',
      timestamp: Date.now(),
      metadata: {
        companyId: companyBId,
        gmailMessageId: `msg-comp-b-${timestamp}`,
        gmailThreadId: `thread-comp-b-${timestamp}`,
      },
    };

    const resBCompany = await processInboundEmail(emailCompanyB, providerB);
    assert(resBCompany.replySent === true, 'Company B successfully processed and replied despite Company A being locked');

    const quotaB = await getEmailQuota(companyBId);
    assert(quotaB.usedCredits === 1, 'Company B consumed 1 credit');
    assert(quotaB.remainingCredits === 99, 'Company B has 99 remaining');

    // Verify Company A is still locked and isolated
    const quotaAIsolated = await getEmailQuota(companyAId);
    assert(quotaAIsolated.usedCredits === 4, 'Company A remains untouched at 4 used');
    assert(quotaAIsolated.automationStatus === 'QUOTA_LOCKED', 'Company A remains QUOTA_LOCKED');

    // =========================================================================
    // STEP 12: Monthly Reset: usedCredits resets to 0 and becomes ACTIVE
    // =========================================================================
    console.log('\n[Step 12] Next quota period / reset: usedCredits automatically resets to 0 and becomes ACTIVE');
    // Force a monthly reset to simulate period rollover
    const resetQuota = await resetCompanyEmailQuota(companyAId, true);
    assert(resetQuota.usedCredits === 0, `Monthly reset cleared usedCredits to 0 (actual: ${resetQuota.usedCredits})`);
    assert(resetQuota.remainingCredits === 4, `remainingCredits restored to full monthlyLimit 4 (actual: ${resetQuota.remainingCredits})`);
    assert(resetQuota.automationStatus === 'ACTIVE', 'Automation status automatically restored to ACTIVE');
    assert(resetQuota.quotaLocked === false, 'quotaLocked flag cleared to false');

    // Final metrics snapshot for report
    const finalQuota = await getEmailQuota(companyAId);
    reportedUsed = finalQuota.usedCredits;
    reportedRemaining = finalQuota.remainingCredits;

    // =========================================================================
    // STEP 13: Final Required Metrics Report
    // =========================================================================
    console.log('\n========================================================================');
    console.log('  GMAIL AI QUOTA UX & BEHAVIOR VERIFICATION REPORT');
    console.log('========================================================================');
    console.log(`  configured limit:            ${reportedConfiguredLimit}`);
    console.log(`  used:                        ${reportedUsed}`);
    console.log(`  remaining:                   ${reportedRemaining}`);
    console.log(`  number of successful replies:${reportedSuccessfulReplies}`);
    console.log(`  number of blocked emails:    ${reportedBlockedEmails}`);
    console.log(`  number of real Gemini calls: ${getRealGeminiCallCount()}`);
    console.log('========================================================================');
    console.log(`  ALL ASSERTIONS PASSED (${passedCount}/${totalAssertions})!`);
    console.log('========================================================================\n');
  } finally {
    clearGeminiMockHandler();
    clearAiClassifierMockHandler();
    await cleanupCompany(companyAId);
    await cleanupCompany(companyBId);
  }
}

main()
  .catch((err) => {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
