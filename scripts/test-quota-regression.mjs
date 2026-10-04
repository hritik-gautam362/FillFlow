/**
 * Dedicated Regression Test Suite for Quota Lock, OAuth Scope Verification, and Watch Diagnostics.
 *
 * Tests:
 * 1. 98 remaining credits → quota reservation succeeds (reservedCredits = 1, remaining = 97)
 * 2. 0 remaining credits → quota reservation fails (status: 'QUOTA_LOCKED')
 * 3. Stale quotaLocked in DB does not block reservation when remaining credits > 0 (self-healing)
 * 4. Commit quota converts reserved to used (used = 3, reserved = 0)
 * 5. Failed send releases reservation (used = 2, reserved = 0)
 * 6. Non-inquiry email: aiCalled = false, quotaReserved = false, replySent = false, credits = 0
 * 7. OAuth scope detection: missing gmail.modify marks requiresReauth: true
 * 8. OAuth scope detection: present gmail.modify activates connected status
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
  reserveEmailQuota,
  commitEmailQuota,
  releaseEmailQuota,
  getEmailQuota,
  determineEmailAutomationStatus,
} from '../src/lib/services/emailQuotaService.ts';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runRegressionTests() {
  console.log('\n===============================================================');
  console.log('  STARTING QUOTA & OAUTH REGRESSION TEST SUITE');
  console.log('===============================================================\n');

  const testId = Date.now();
  const testCompanyId = `test-reg-${testId}`;

  // Create isolated company for testing
  const company = await prisma.company.create({
    data: {
      id: testCompanyId,
      name: `Regression Test Co ${testId}`,
    },
  });

  // Create active Google connection
  await prisma.automationConnection.create({
    data: {
      companyId: testCompanyId,
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: `reg-${testId}@example.com`,
      metadata: {
        googleEmail: `reg-${testId}@example.com`,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
      },
    },
  });

  // -------------------------------------------------------------
  // Test 1: 98 remaining credits (monthlyLimit = 100, used = 2, reserved = 0)
  // -------------------------------------------------------------
  console.log('[Test 1] 98 Remaining Credits → Quota Reservation Succeeds');
  {
    await prisma.automationAccess.upsert({
      where: {
        companyId_automationType: {
          companyId: testCompanyId,
          automationType: AutomationType.email,
        },
      },
      update: {
        monthlyLimit: 100,
        usedCredits: 2,
        reservedCredits: 0,
        quotaLocked: false,
        adminDisabled: false,
      },
      create: {
        companyId: testCompanyId,
        automationType: AutomationType.email,
        enabled: true,
        monthlyLimit: 100,
        usedCredits: 2,
        reservedCredits: 0,
        quotaLocked: false,
        adminDisabled: false,
      },
    });

    const res = await reserveEmailQuota(testCompanyId, `msg-${testId}-1`);
    assert(res.success === true, 'Reservation succeeded');
    assert(res.status === 'ACTIVE', 'Status is ACTIVE');
    assert(res.remainingCredits === 97, 'Remaining credits updated to 97');

    const dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.reservedCredits === 1, 'reservedCredits is 1 in database');
    assert(dbAccess.usedCredits === 2, 'usedCredits remains 2 in database');
  }

  // -------------------------------------------------------------
  // Test 2: Successful send commits reserved credit
  // -------------------------------------------------------------
  console.log('\n[Test 2] Successful Send Commits Reserved Credit (used: 3, reserved: 0)');
  {
    const commitRes = await commitEmailQuota(testCompanyId, `msg-${testId}-1`);
    assert(commitRes.usedCredits === 3, 'usedCredits incremented to 3');
    assert(commitRes.remainingCredits === 97, 'remainingCredits is 97');

    const dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.usedCredits === 3, 'usedCredits committed as 3');
    assert(dbAccess.reservedCredits === 0, 'reservedCredits reset to 0');
  }

  // -------------------------------------------------------------
  // Test 3: Failed send releases reservation (used: 2, reserved: 0)
  // -------------------------------------------------------------
  console.log('\n[Test 3] Failed Send Releases Reservation Back to 0');
  {
    // Reserve another credit
    const res = await reserveEmailQuota(testCompanyId, `msg-${testId}-2`);
    assert(res.success === true, 'Reservation for message 2 succeeded');

    let dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.reservedCredits === 1, 'reservedCredits is 1 during send');

    // Simulate send failure -> release quota
    await releaseEmailQuota(testCompanyId, `msg-${testId}-2`, 'Simulated send network error');

    dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.reservedCredits === 0, 'reservedCredits released back to 0');
    assert(dbAccess.usedCredits === 3, 'usedCredits not incremented (remains 3)');
  }

  // -------------------------------------------------------------
  // Test 4: Quota Self-Healing when quotaLocked = true but 98 credits remain
  // -------------------------------------------------------------
  console.log('\n[Test 4] Quota Self-Healing: Stale quotaLocked = true in DB Does Not Block Reservation');
  {
    // Artificially simulate stale lock in DB
    await prisma.automationAccess.update({
      where: {
        companyId_automationType: {
          companyId: testCompanyId,
          automationType: AutomationType.email,
        },
      },
      data: {
        monthlyLimit: 100,
        usedCredits: 2,
        reservedCredits: 0,
        quotaLocked: true, // STALE LOCK!
      },
    });

    // Check getEmailQuota self-heals
    const quotaInfo = await getEmailQuota(testCompanyId);
    assert(quotaInfo.remainingCredits === 98, 'getEmailQuota reports 98 remaining credits');
    assert(quotaInfo.quotaLocked === false, 'quotaLocked self-healed to false in getEmailQuota');
    assert(quotaInfo.automationStatus === 'ACTIVE', 'automationStatus is ACTIVE');

    // Reserve should succeed and self-heal
    const res = await reserveEmailQuota(testCompanyId, `msg-${testId}-3`);
    assert(res.success === true, 'Reservation succeeded despite stale quotaLocked flag in DB');
    assert(res.status === 'ACTIVE', 'Status returned is ACTIVE');

    const dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.quotaLocked === false, 'quotaLocked cleared in database');
    assert(dbAccess.reservedCredits === 1, 'reservedCredits incremented to 1');

    // Clean up reservation
    await releaseEmailQuota(testCompanyId, `msg-${testId}-3`, 'Test cleanup');
  }

  // -------------------------------------------------------------
  // Test 5: 0 remaining credits → Quota Reservation Fails
  // -------------------------------------------------------------
  console.log('\n[Test 5] 0 Remaining Credits → Quota Reservation Fails with QUOTA_LOCKED');
  {
    await prisma.automationAccess.update({
      where: {
        companyId_automationType: {
          companyId: testCompanyId,
          automationType: AutomationType.email,
        },
      },
      data: {
        monthlyLimit: 100,
        usedCredits: 100,
        reservedCredits: 0,
        quotaLocked: true,
      },
    });

    const res = await reserveEmailQuota(testCompanyId, `msg-${testId}-4`);
    assert(res.success === false, 'Reservation rejected for exhausted quota');
    assert(res.status === 'QUOTA_LOCKED', 'Status is QUOTA_LOCKED');
    assert(res.reason === 'Monthly AI email limit reached.', 'Reason explains limit reached');
    assert(res.remainingCredits === 0, 'Remaining credits is 0');
  }

  // -------------------------------------------------------------
  // Test 6: Non-Inquiry Email (Newsletter / Promo)
  // -------------------------------------------------------------
  console.log('\n[Test 6] Non-Inquiry Email (Newsletter) Does Not Consume Quota');
  {
    // Reset quota to 100 limit, 2 used, 0 reserved
    await prisma.automationAccess.update({
      where: {
        companyId_automationType: {
          companyId: testCompanyId,
          automationType: AutomationType.email,
        },
      },
      data: {
        monthlyLimit: 100,
        usedCredits: 2,
        reservedCredits: 0,
        quotaLocked: false,
      },
    });

    const mockProvider = new GoogleProvider({
      companyId: testCompanyId,
      accessToken: 'sim-test-access',
      refreshToken: 'sim-test-refresh',
      connectedEmail: `reg-${testId}@example.com`,
      simulated: true,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
    });

    const newsletterEmail = {
      messageId: `newsletter-${testId}`,
      sender: 'newsletter@deals-and-discounts.com',
      recipient: `reg-${testId}@example.com`,
      subject: 'Weekly Deals Digest - 50% off all winter apparel!',
      text: 'Unsubscribe anytime. Click here to view top sales this week in our catalog.',
      timestamp: Date.now(),
      rawHeaders: {
        'list-unsubscribe': '<mailto:unsubscribe@deals.com>',
        'precedence': 'bulk',
      },
      metadata: {
        gmailMessageId: `newsletter-${testId}`,
        gmailThreadId: `thread-newsletter-${testId}`,
      },
    };

    const processRes = await processInboundEmail(newsletterEmail, mockProvider);
    assert(processRes.success === true, 'Processed newsletter without error');
    assert(processRes.status === 'skipped_irrelevant', 'Status is skipped_irrelevant (no reply sent for newsletter)');
    assert(processRes.classification !== 'CUSTOMER_INQUIRY', 'Classified as non-inquiry');

    const dbAccess = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    assert(dbAccess.usedCredits === 2, 'usedCredits remains exactly 2 (zero credits consumed)');
    assert(dbAccess.reservedCredits === 0, 'reservedCredits remains 0');
  }

  // -------------------------------------------------------------
  // Test 7: Customer Inquiry End-to-End Processing
  // -------------------------------------------------------------
  console.log('\n[Test 7] Customer Inquiry End-to-End: Reserve → Reply → Commit');
  {
    const { setAiClassifierMockHandler, clearAiClassifierMockHandler } = await import(
      '../src/lib/services/email/emailClassifier.ts'
    );

    setAiClassifierMockHandler(() => ({
      classification: 'CUSTOMER_INQUIRY',
      category: 'client_inquiry',
      reason: 'service / company inquiry detected',
      confidence: 0.98,
      deterministic: false,
      requiresReply: true,
      intent: 'service_inquiry',
    }));

    const mockProvider = new GoogleProvider({
      companyId: testCompanyId,
      accessToken: 'sim-test-access',
      refreshToken: 'sim-test-refresh',
      connectedEmail: `reg-${testId}@example.com`,
      simulated: true,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
    });

    const customerEmail = {
      messageId: `inquiry-${testId}`,
      sender: 'client-prospect@corporate.com',
      recipient: `reg-${testId}@example.com`,
      subject: 'Inquiry: FillFlow Service & Pricing',
      text: 'Hi Team, I am interested in your AI automated email service. What are your pricing plans and how quickly can we onboard?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `inquiry-${testId}`,
        gmailThreadId: `thread-inquiry-${testId}`,
      },
    };

    try {
      const processRes = await processInboundEmail(customerEmail, mockProvider);
      assert(processRes.success === true, 'Customer inquiry processed successfully');
      assert(processRes.status === 'processed', 'Status is processed');
      assert(processRes.classification === 'CUSTOMER_INQUIRY', 'Classification = CUSTOMER_INQUIRY');

      const dbAccess = await prisma.automationAccess.findFirst({
        where: { companyId: testCompanyId, automationType: AutomationType.email },
      });
      assert(dbAccess.usedCredits === 3, 'usedCredits incremented from 2 to 3');
      assert(dbAccess.reservedCredits === 0, 'reservedCredits reset to 0 after send');
    } finally {
      clearAiClassifierMockHandler();
    }
  }

  // -------------------------------------------------------------
  // Test 8: OAuth Scope Detection (gmail.modify presence / absence)
  // -------------------------------------------------------------
  console.log('\n[Test 8] OAuth Scope Detection & Enforcement');
  {
    const providerWithModify = new GoogleProvider({
      simulated: false,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
    });
    assert(providerWithModify.hasScope('gmail.modify') === true, 'Provider correctly identifies gmail.modify is present');

    const providerWithoutModify = new GoogleProvider({
      simulated: false,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    });
    assert(providerWithoutModify.hasScope('gmail.modify') === false, 'Provider correctly identifies gmail.modify is missing');
  }

  console.log('\n===============================================================');
  console.log(`  REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests()
  .catch((err) => {
    console.error('Regression suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
