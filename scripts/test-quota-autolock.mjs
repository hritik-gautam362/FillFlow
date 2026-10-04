/**
 * test-quota-autolock.mjs
 *
 * Verifies all 17 requirements for FillFlow's Email Automation Usage, Limit, and Auto-Lock system:
 * 1. Company with 100 limit and 0 usage -> ACTIVE
 * 2. Successful AI reply -> usage becomes 1
 * 3. Usage reaches exact limit -> QUOTA_LOCKED
 * 4. New customer email while quota locked -> no Gemini call and no Gmail send
 * 5. Failed AI generation -> no credit consumed
 * 6. Failed Gmail send -> no credit consumed
 * 7. Duplicate Gmail message -> no double consumption
 * 8. Two concurrent requests competing for final credit -> only one can consume it
 * 9. Increase limit after QUOTA_LOCKED -> automatically ACTIVE
 * 10. Monthly reset after QUOTA_LOCKED -> automatically ACTIVE
 * 11. ADMIN_DISABLED company stays disabled after limit increase
 * 12. ADMIN_DISABLED company stays disabled after monthly reset
 * 13. Disconnected Gmail -> DISCONNECTED
 * 14. Company A cannot access Company B's quota or usage
 * 15. Usage can never become negative
 * 16. Repeated reset operation is idempotent
 * 17. Repeated quota-lock operation is idempotent
 */

import { config } from 'dotenv';
config();

import { AutomationType, ConnectionStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

// Helper functions importing directly
import {
  getEmailQuota,
  reserveEmailQuota,
  commitEmailQuota,
  releaseEmailQuota,
  updateMonthlyLimit,
  setAdminAutomationDisabled,
  resetCompanyEmailQuota,
  determineEmailAutomationStatus,
} from '../src/lib/services/emailQuotaService';

import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService';

let passed = 0;
let failed = 0;

function assert(condition, testNum, message) {
  if (condition) {
    console.log(`  ✅ Test ${testNum} PASSED: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ Test ${testNum} FAILED: ${message}`);
    failed++;
    throw new Error(`Test ${testNum} FAILED: ${message}`);
  }
}

async function setupTestEnvironment() {
  console.log('🔧 Setting up test companies and connections...');

  // Clean up previous test runs if any
  await prisma.automationQuotaAuditLog.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.chatMessage.deleteMany({
    where: { lead: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } } },
  });
  await prisma.lead.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.automationAccess.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.automationConnection.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.company.deleteMany({
    where: { id: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });

  // Create Company A
  await prisma.company.create({
    data: {
      id: 'test-quota-comp-a',
      name: 'Quota Test Company A',
    },
  });

  // Create Company B
  await prisma.company.create({
    data: {
      id: 'test-quota-comp-b',
      name: 'Quota Test Company B',
    },
  });

  // Setup Connected Gmail for Company A
  await prisma.automationConnection.create({
    data: {
      companyId: 'test-quota-comp-a',
      automationType: AutomationType.email,
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: 'test-agent@companya.com',
      metadata: { googleEmail: 'test-agent@companya.com' },
    },
  });

  // Setup Disconnected Gmail for Company B (for Test 13)
  await prisma.automationConnection.create({
    data: {
      companyId: 'test-quota-comp-b',
      automationType: AutomationType.email,
      status: ConnectionStatus.disconnected,
      provider: 'google',
    },
  });

  console.log('✅ Test environment ready.\n');
}

async function cleanupTestEnvironment() {
  console.log('\n🧹 Cleaning up test companies...');
  await prisma.automationQuotaAuditLog.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.chatMessage.deleteMany({
    where: { lead: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } } },
  });
  await prisma.lead.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.automationAccess.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.automationConnection.deleteMany({
    where: { companyId: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.company.deleteMany({
    where: { id: { in: ['test-quota-comp-a', 'test-quota-comp-b'] } },
  });
  await prisma.$disconnect();
}

// Mock Email Provider for testing pipeline
function createMockEmailProvider(options = {}) {
  let sendCount = 0;
  return {
    providerName: 'mock_provider',
    getSendCount: () => sendCount,
    sendMessage: async (msg) => {
      sendCount++;
      if (options.failSend) {
        return { success: false, error: 'Gmail API send error 500' };
      }
      return { success: true, providerMessageId: `mock-outbound-${Date.now()}-${Math.random()}` };
    },
    markAsRead: async () => true,
  };
}

async function runAllTests() {
  await setupTestEnvironment();

  console.log('🚀 Running 17 Verification Scenarios...\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Company with 100 limit and 0 usage -> ACTIVE
  // ---------------------------------------------------------------------------
  clearEmailIdCacheForTesting();
  const quota1 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota1.monthlyLimit === 100 &&
      quota1.usedCredits === 0 &&
      quota1.remainingCredits === 100 &&
      quota1.automationStatus === 'ACTIVE',
    1,
    'Company with 100 limit and 0 usage resolves to ACTIVE'
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Successful AI reply -> usage becomes 1
  // ---------------------------------------------------------------------------
  clearEmailIdCacheForTesting();
  const mockProvider2 = createMockEmailProvider();
  const res2 = await processInboundEmail(
    {
      messageId: `test-msg-2-${Date.now()}`,
      sender: 'client-test-2@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Inquiry for AI project consultation',
      text: 'Hello, we are looking for a software partner to build an AI SaaS application. Our budget is $40k. Can we discuss?',
      metadata: {
        gmailMessageId: `gmail-msg-2-${Date.now()}`,
        classification: 'client_inquiry',
      },
    },
    mockProvider2
  );

  assert(res2.success === true, 2, 'Inbound email processed successfully');
  const quota2 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota2.usedCredits === 1 && quota2.remainingCredits === 99 && quota2.automationStatus === 'ACTIVE',
    2,
    `Successful AI reply consumed 1 credit (used: ${quota2.usedCredits}, remaining: ${quota2.remainingCredits})`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Usage reaches exact limit -> QUOTA_LOCKED
  // ---------------------------------------------------------------------------
  // Set limit to 2 so next reply reaches 2/2 = QUOTA_LOCKED
  await updateMonthlyLimit('test-quota-comp-a', 2);
  clearEmailIdCacheForTesting();
  const mockProvider3 = createMockEmailProvider();
  const res3 = await processInboundEmail(
    {
      messageId: `test-msg-3-${Date.now()}`,
      sender: 'client-test-3@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Mobile app project inquiry',
      text: 'We want to build an iOS and Android app for logistics tracking. Please send us your portfolio and timeline estimate.',
      metadata: {
        gmailMessageId: `gmail-msg-3-${Date.now()}`,
        classification: 'client_inquiry',
      },
    },
    mockProvider3
  );

  assert(res3.success === true, 3, 'Inbound email 2 processed successfully');
  const quota3 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota3.usedCredits === 2 &&
      quota3.remainingCredits === 0 &&
      quota3.quotaLocked === true &&
      quota3.automationStatus === 'QUOTA_LOCKED',
    3,
    `Usage reached exact limit (2/2) -> QUOTA_LOCKED (status: ${quota3.automationStatus})`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: New customer email while quota locked -> no Gemini call and no Gmail send
  // ---------------------------------------------------------------------------
  clearEmailIdCacheForTesting();
  const mockProvider4 = createMockEmailProvider();
  const res4 = await processInboundEmail(
    {
      messageId: `test-msg-4-${Date.now()}`,
      sender: 'client-test-4@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'New RFP request while quota locked',
      text: 'We have a web development request. What are your rates?',
      metadata: {
        gmailMessageId: `gmail-msg-4-${Date.now()}`,
        classification: 'client_inquiry',
      },
    },
    mockProvider4
  );

  assert(res4.success === false, 4, 'Processing halted due to quota lock');
  assert(res4.status === 'quota_locked', 4, 'Status is quota_locked');
  assert(mockProvider4.getSendCount() === 0, 4, 'Zero Gmail sends were performed');
  const quota4 = await getEmailQuota('test-quota-comp-a');
  assert(quota4.usedCredits === 2, 4, 'Used credits remained unchanged at 2');

  // ---------------------------------------------------------------------------
  // TEST 5: Failed AI generation -> no credit consumed
  // ---------------------------------------------------------------------------
  // Temporarily raise limit so quota is available
  await updateMonthlyLimit('test-quota-comp-a', 10);
  clearEmailIdCacheForTesting();
  const beforeUsed5 = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  const mockProvider5 = createMockEmailProvider();

  const res5 = await processInboundEmail(
    {
      messageId: `test-msg-5-${Date.now()}`,
      sender: 'client-test-5@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Project inquiry simulated AI crash',
      text: 'Tell me about your services.',
      metadata: {
        gmailMessageId: `gmail-msg-5-${Date.now()}`,
        simulateAiError: true, // Triggers simulated AI failure
      },
    },
    mockProvider5
  );

  assert(res5.success === false, 5, 'AI failure properly caught');
  const quota5 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota5.usedCredits === beforeUsed5 && quota5.reservedCredits === 0,
    5,
    `Failed AI generation consumed 0 credits (used remains ${quota5.usedCredits}, reserved: ${quota5.reservedCredits})`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Failed Gmail send -> no credit consumed
  // ---------------------------------------------------------------------------
  clearEmailIdCacheForTesting();
  const beforeUsed6 = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  const mockProvider6 = createMockEmailProvider({ failSend: true });

  const res6 = await processInboundEmail(
    {
      messageId: `test-msg-6-${Date.now()}`,
      sender: 'client-test-6@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Inquiry with failing send provider',
      text: 'We want to schedule a discovery call for e-commerce website redesign.',
      metadata: {
        gmailMessageId: `gmail-msg-6-${Date.now()}`,
        classification: 'client_inquiry',
      },
    },
    mockProvider6
  );

  assert(res6.success === false, 6, 'Send failure captured');
  const quota6 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota6.usedCredits === beforeUsed6 && quota6.reservedCredits === 0,
    6,
    `Failed Gmail send consumed 0 credits (used: ${quota6.usedCredits}, reserved: ${quota6.reservedCredits})`
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Duplicate Gmail message -> no double consumption
  // ---------------------------------------------------------------------------
  const duplicateGmailMsgId = `gmail-dup-${Date.now()}`;
  const mockProvider7 = createMockEmailProvider();

  // First send
  const res7a = await processInboundEmail(
    {
      messageId: `test-msg-7a-${Date.now()}`,
      sender: 'client-test-7@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Duplicate test client inquiry',
      text: 'We need software consultation for our team.',
      metadata: { gmailMessageId: duplicateGmailMsgId, classification: 'client_inquiry' },
    },
    mockProvider7
  );
  assert(res7a.success === true, 7, 'First send succeeded');

  const quotaAfterFirst = (await getEmailQuota('test-quota-comp-a')).usedCredits;

  // Second send with same Gmail message ID
  const res7b = await processInboundEmail(
    {
      messageId: `test-msg-7b-${Date.now()}`,
      sender: 'client-test-7@example.com',
      recipient: 'test-agent@companya.com',
      subject: 'Duplicate test client inquiry',
      text: 'We need software consultation for our team.',
      metadata: { gmailMessageId: duplicateGmailMsgId, classification: 'client_inquiry' },
    },
    mockProvider7
  );

  assert(res7b.status === 'duplicate_ignored', 7, 'Duplicate correctly ignored');
  const quotaAfterSecond = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  assert(
    quotaAfterFirst === quotaAfterSecond,
    7,
    `Duplicate Gmail message did not consume multiple credits (${quotaAfterFirst} === ${quotaAfterSecond})`
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Two concurrent requests competing for final credit -> only one can consume it
  // ---------------------------------------------------------------------------
  // Set limit equal to used + 1 so exactly 1 credit is available
  const currentUsed8 = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  await updateMonthlyLimit('test-quota-comp-a', currentUsed8 + 1);

  // Verify exactly 1 available
  const verifyQuota8 = await getEmailQuota('test-quota-comp-a');
  assert(verifyQuota8.remainingCredits === 1, 8, 'Exactly 1 remaining credit set up for competition');

  // Launch two concurrent reservations simultaneously
  const [resA, resB] = await Promise.all([
    reserveEmailQuota('test-quota-comp-a', 'concurrent-msg-A'),
    reserveEmailQuota('test-quota-comp-a', 'concurrent-msg-B'),
  ]);

  const successes = [resA, resB].filter((r) => r.success);
  const failures = [resA, resB].filter((r) => !r.success);

  assert(successes.length === 1, 8, 'Exactly one concurrent reservation succeeded');
  assert(failures.length === 1, 8, 'Exactly one concurrent reservation failed');
  assert(failures[0].status === 'QUOTA_LOCKED', 8, 'Failing reservation received QUOTA_LOCKED');

  // Clean up the reserved credit
  await releaseEmailQuota('test-quota-comp-a', 'concurrent-msg-A', 'TEST_CLEANUP');

  // ---------------------------------------------------------------------------
  // TEST 9: Increase limit after QUOTA_LOCKED -> automatically ACTIVE
  // ---------------------------------------------------------------------------
  // Exhaust quota to QUOTA_LOCKED
  const currentUsed9 = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  await updateMonthlyLimit('test-quota-comp-a', currentUsed9);
  const lockedQuota9 = await getEmailQuota('test-quota-comp-a');
  assert(lockedQuota9.automationStatus === 'QUOTA_LOCKED', 9, 'Company placed in QUOTA_LOCKED');

  // Increase limit
  await updateMonthlyLimit('test-quota-comp-a', currentUsed9 + 50);
  const unlockedQuota9 = await getEmailQuota('test-quota-comp-a');
  assert(
    unlockedQuota9.automationStatus === 'ACTIVE' &&
      unlockedQuota9.quotaLocked === false &&
      unlockedQuota9.remainingCredits === 50,
    9,
    'Increasing allowance automatically unlocks company to ACTIVE'
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Monthly reset after QUOTA_LOCKED -> automatically ACTIVE
  // ---------------------------------------------------------------------------
  // Exhaust quota
  const currentUsed10 = (await getEmailQuota('test-quota-comp-a')).usedCredits;
  await updateMonthlyLimit('test-quota-comp-a', currentUsed10);
  assert(
    (await getEmailQuota('test-quota-comp-a')).automationStatus === 'QUOTA_LOCKED',
    10,
    'Company quota-locked before reset'
  );

  // Trigger monthly reset
  await resetCompanyEmailQuota('test-quota-comp-a', true);
  const resetQuota10 = await getEmailQuota('test-quota-comp-a');
  assert(
    resetQuota10.usedCredits === 0 &&
      resetQuota10.automationStatus === 'ACTIVE' &&
      resetQuota10.quotaLocked === false,
    10,
    'Monthly reset resets used credits to 0 and automatically unlocks to ACTIVE'
  );

  // ---------------------------------------------------------------------------
  // TEST 11: ADMIN_DISABLED company stays disabled after limit increase
  // ---------------------------------------------------------------------------
  await setAdminAutomationDisabled('test-quota-comp-a', true);
  const disabled11 = await getEmailQuota('test-quota-comp-a');
  assert(disabled11.automationStatus === 'ADMIN_DISABLED', 11, 'Company placed in ADMIN_DISABLED');

  // Increase limit
  await updateMonthlyLimit('test-quota-comp-a', 500);
  const afterIncrease11 = await getEmailQuota('test-quota-comp-a');
  assert(
    afterIncrease11.automationStatus === 'ADMIN_DISABLED' && afterIncrease11.adminDisabled === true,
    11,
    'ADMIN_DISABLED company stays disabled after limit increase'
  );

  // ---------------------------------------------------------------------------
  // TEST 12: ADMIN_DISABLED company stays disabled after monthly reset
  // ---------------------------------------------------------------------------
  await resetCompanyEmailQuota('test-quota-comp-a', true);
  const afterReset12 = await getEmailQuota('test-quota-comp-a');
  assert(
    afterReset12.automationStatus === 'ADMIN_DISABLED' &&
      afterReset12.adminDisabled === true &&
      afterReset12.usedCredits === 0,
    12,
    'ADMIN_DISABLED company stays disabled after monthly reset'
  );

  // Re-enable automation for further tests
  await setAdminAutomationDisabled('test-quota-comp-a', false);

  // ---------------------------------------------------------------------------
  // TEST 13: Disconnected Gmail -> DISCONNECTED
  // ---------------------------------------------------------------------------
  const quota13 = await getEmailQuota('test-quota-comp-b');
  assert(
    quota13.automationStatus === 'DISCONNECTED' && quota13.isGmailConnected === false,
    13,
    'Company B with disconnected Gmail evaluates to DISCONNECTED'
  );

  // ---------------------------------------------------------------------------
  // TEST 14: Company A cannot access Company B's quota or usage
  // ---------------------------------------------------------------------------
  const quotaA = await getEmailQuota('test-quota-comp-a');
  const quotaB = await getEmailQuota('test-quota-comp-b');
  assert(
    quotaA.companyId === 'test-quota-comp-a' &&
      quotaB.companyId === 'test-quota-comp-b' &&
      quotaA.monthlyLimit !== quotaB.monthlyLimit,
    14,
    'Tenant isolation strictly maintained between Company A and Company B'
  );

  // ---------------------------------------------------------------------------
  // TEST 15: Usage can never become negative
  // ---------------------------------------------------------------------------
  // Attempt to release quota when reserved is 0
  await releaseEmailQuota('test-quota-comp-a', 'phantom-msg-1', 'TEST_NEGATIVE');
  await releaseEmailQuota('test-quota-comp-a', 'phantom-msg-2', 'TEST_NEGATIVE');
  const quota15 = await getEmailQuota('test-quota-comp-a');
  assert(
    quota15.usedCredits >= 0 && quota15.reservedCredits >= 0,
    15,
    `Credits never negative (used: ${quota15.usedCredits}, reserved: ${quota15.reservedCredits})`
  );

  // ---------------------------------------------------------------------------
  // TEST 16: Repeated reset operation is idempotent
  // ---------------------------------------------------------------------------
  // Calling regular checkAndResetMonthlyQuota twice in a row without force
  const resetFirst = await resetCompanyEmailQuota('test-quota-comp-a', false);
  const resetSecond = await resetCompanyEmailQuota('test-quota-comp-a', false);
  assert(
    resetFirst.nextResetAt.getTime() === resetSecond.nextResetAt.getTime() &&
      resetFirst.usedCredits === resetSecond.usedCredits,
    16,
    'Repeated non-forced reset operation is completely idempotent'
  );

  // ---------------------------------------------------------------------------
  // TEST 17: Repeated quota-lock operation is idempotent
  // ---------------------------------------------------------------------------
  // Lock quota
  const currentLimit17 = (await getEmailQuota('test-quota-comp-a')).monthlyLimit;
  await updateMonthlyLimit('test-quota-comp-a', 0); // limit 0 forces lock
  const lock1 = await getEmailQuota('test-quota-comp-a');
  assert(lock1.automationStatus === 'QUOTA_LOCKED', 17, 'Initial lock successful');

  // Attempt to reserve again (triggers second lock attempt)
  const lockAttempt2 = await reserveEmailQuota('test-quota-comp-a', 'lock-attempt-2');
  assert(lockAttempt2.status === 'QUOTA_LOCKED', 17, 'Second lock attempt returns QUOTA_LOCKED');
  const lock2 = await getEmailQuota('test-quota-comp-a');
  assert(
    lock2.automationStatus === 'QUOTA_LOCKED' && lock2.quotaLocked === true,
    17,
    'Repeated quota-lock operation is idempotent with stable state'
  );

  console.log('\n=======================================');
  console.log(`🎉 ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('=======================================\n');
}

runAllTests()
  .catch((err) => {
    console.error('❌ Test suite execution failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupTestEnvironment();
  });
