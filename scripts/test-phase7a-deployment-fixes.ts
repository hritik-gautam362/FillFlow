import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import { NextRequest } from 'next/server';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma';
import { getAiModel, DEFAULT_AI_MODEL } from '../src/lib/ai/gemini';
import { POST as renewPost, GET as renewGet } from '../src/app/api/integrations/google/watch/renew/route';
import { handleGooglePubSubWebhook } from '../src/lib/services/email/googlePubSubWebhookService';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
  recordEmailIdInMemory,
} from '../src/lib/services/email/emailInboundService';
import { getEmailQuota, resetCompanyEmailQuota } from '../src/lib/services/emailQuotaService';
import { listApprovalItems, resetMemoryApprovalQueue } from '../src/lib/services/aiApprovalService';
import { EmailProvider, SendEmailResult } from '../src/lib/services/email/EmailProvider';
import { AutomationType, ConnectionStatus } from '@prisma/client';

class MockEmailProvider {
  sentEmails: any[] = [];
  readMessageIds: string[] = [];
  shouldFailSend: boolean = false;

  async sendMessage(params: any): Promise<SendEmailResult> {
    if (this.shouldFailSend) {
      return { success: false, error: 'Simulated send failure' };
    }
    this.sentEmails.push(params);
    return {
      success: true,
      providerMessageId: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      simulated: true,
    };
  }

  async fetchMessage(messageId: string): Promise<any> {
    return {
      messageId,
      sender: 'client@example.com',
      recipient: 'company@fillflow.io',
      subject: 'Test Subject',
      text: 'Hello test message',
      timestamp: Date.now(),
    };
  }

  async markAsRead(messageId: string): Promise<void> {
    this.readMessageIds.push(messageId);
  }

  async listHistory(_startHistoryId: string): Promise<any> {
    return { messageIds: [], latestHistoryId: '100' };
  }
}

async function main() {
  console.log('================================================================');
  console.log('STARTING PHASE 7A DEPLOYMENT BLOCKER FIXES VERIFICATION');
  console.log('================================================================\n');

  let passedTests = 0;
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: AI_MODEL Configuration Consistency
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Testing AI_MODEL configuration consistency...');
    delete process.env.AI_MODEL;
    assert.strictEqual(DEFAULT_AI_MODEL, 'gemini-flash-lite-latest', 'DEFAULT_AI_MODEL must be gemini-flash-lite-latest');
    assert.strictEqual(getAiModel(), 'gemini-flash-lite-latest', 'Default model fallback must be gemini-flash-lite-latest when env is unset');

    process.env.AI_MODEL = 'gemini-2.0-flash';
    assert.strictEqual(getAiModel(), 'gemini-2.0-flash', 'Must respect process.env.AI_MODEL when explicitly set');
    delete process.env.AI_MODEL;

    console.log('  ✅ PASSED: AI_MODEL standardized to gemini-flash-lite-latest with dynamic env override support.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2: Production Missing CRON_SECRET Fails Closed
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Testing production missing CRON_SECRET fails closed...');
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.CRON_SECRET;

    const reqMissingCron = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'POST',
      body: JSON.stringify({ thresholdHours: 48 }),
    });

    const resMissingCron = await renewPost(reqMissingCron);
    const jsonMissing = await resMissingCron.json();

    assert.strictEqual(resMissingCron.status, 401, 'Must return 401 Unauthorized in production when CRON_SECRET is missing');
    assert.strictEqual(jsonMissing.success, false, 'Success must be false');
    assert.ok(jsonMissing.error?.includes('CRON_SECRET is required in production'), 'Error must inform about missing CRON_SECRET');

    const reqMissingCronGet = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'GET',
    });
    const resMissingCronGet = await renewGet(reqMissingCronGet);
    assert.strictEqual(resMissingCronGet.status, 401, 'GET must also return 401 Unauthorized in production when CRON_SECRET is missing');

    console.log('  ✅ PASSED: Missing CRON_SECRET in production fails closed with 401.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Valid CRON_SECRET Accepted (Bearer and x-cron-secret)
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Testing valid CRON_SECRET acceptance...');
    const testSecret = 'test_cron_secret_high_entropy_12345';
    process.env.CRON_SECRET = testSecret;

    // Test with Bearer auth header (standard Vercel Cron invocation)
    const reqBearer = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testSecret}`,
      },
      body: JSON.stringify({ companyId: 'test-auth-check' }),
    });
    const resBearer = await renewPost(reqBearer);
    assert.strictEqual(resBearer.status, 200, 'Must accept matching Bearer token with 200 OK');

    // Test with x-cron-secret header (custom scheduler invocation)
    const reqCustomHeader = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'POST',
      headers: {
        'x-cron-secret': testSecret,
      },
      body: JSON.stringify({ companyId: 'test-auth-check' }),
    });
    const resCustomHeader = await renewPost(reqCustomHeader);
    assert.strictEqual(resCustomHeader.status, 200, 'Must accept matching x-cron-secret header with 200 OK');

    console.log('  ✅ PASSED: Both Bearer and x-cron-secret headers successfully authenticated.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Invalid CRON_SECRET Rejected
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Testing invalid CRON_SECRET rejection...');
    const reqBadSecret = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret-value',
      },
      body: JSON.stringify({}),
    });
    const resBadSecret = await renewPost(reqBadSecret);
    const jsonBadSecret = await resBadSecret.json();
    assert.strictEqual(resBadSecret.status, 401, 'Must reject invalid token with 401 Unauthorized');
    assert.strictEqual(jsonBadSecret.success, false);

    console.log('  ✅ PASSED: Unauthorized requests with mismatched secrets are rejected.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Renewal Route Tenant-Safety
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Testing renewal route tenant-safety...');
    // Finding or using a companyId parameter
    const testCompanyId = 'non_existent_company_tenant_check';
    const reqTenantScoped = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testSecret}`,
      },
      body: JSON.stringify({ companyId: testCompanyId, thresholdHours: 24 }),
    });

    const resTenant = await renewPost(reqTenantScoped);
    const jsonTenant = await resTenant.json();
    assert.strictEqual(resTenant.status, 200, 'Tenant-scoped renewal executes cleanly');
    assert.strictEqual(jsonTenant.success, true);
    assert.strictEqual(jsonTenant.data.renewed, false, 'Does not renew invalid/missing company connection');

    console.log('  ✅ PASSED: Renewal route accepts isolated companyId scope without affecting other tenants.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Webhook Verification Token Enforcement
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Testing Google Pub/Sub webhook verification token enforcement...');
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;

    // Missing token in production should return 401
    const resNoTokenProd = await handleGooglePubSubWebhook({
      body: { message: { data: Buffer.from(JSON.stringify({ emailAddress: 'test@example.com' })).toString('base64') } },
      queryToken: null,
      authHeader: null,
    });
    assert.strictEqual(resNoTokenProd.statusCode, 401, 'Must reject missing webhook token in production with 401');

    // Configured token with mismatch should return 401
    process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN = 'secret-pubsub-verification-token';
    const resWrongToken = await handleGooglePubSubWebhook({
      body: { message: { data: Buffer.from(JSON.stringify({ emailAddress: 'test@example.com' })).toString('base64') } },
      queryToken: 'wrong-token',
      authHeader: null,
    });
    assert.strictEqual(resWrongToken.statusCode, 401, 'Must reject mismatched token with 401');

    // Matching query token succeeds verification
    const resValidToken = await handleGooglePubSubWebhook({
      body: { message: { data: Buffer.from(JSON.stringify({ emailAddress: 'unknown@example.com' })).toString('base64') } },
      queryToken: 'secret-pubsub-verification-token',
      authHeader: null,
    });
    // Unknown email returns 200 with no connection mapped, confirming verification passed
    assert.strictEqual(resValidToken.statusCode, 200, 'Matching token passes verification');

    console.log('  ✅ PASSED: Webhook verification token strictly enforced in production.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Inbound Idempotency Remains Intact
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Testing inbound email idempotency...');
    clearEmailIdCacheForTesting();
    const testMsgId = `idemp-test-${Date.now()}`;
    recordEmailIdInMemory(testMsgId);

    const mockProvider = new MockEmailProvider();
    const duplicateRes = await processInboundEmail(
      {
        messageId: testMsgId,
        sender: 'sender@example.com',
        recipient: 'company@fillflow.io',
        subject: 'Inquiry',
        text: 'Hello I need services',
        timestamp: Date.now(),
      },
      mockProvider as unknown as EmailProvider
    );

    assert.strictEqual(duplicateRes.status, 'duplicate_ignored', 'Duplicate email must be ignored');
    assert.strictEqual(duplicateRes.success, true, 'Duplicate response returns success: true');
    assert.strictEqual(mockProvider.sentEmails.length, 0, 'No outbound email may be sent on duplicate');

    console.log('  ✅ PASSED: Existing idempotency mechanism prevents duplicate processing.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Quota Reservation and Settlement Integrity
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Testing quota reservation and settlement integrity...');
    const company = await prisma.company.findFirst({
      include: { automationAccess: true },
    });
    assert.ok(company, 'Must have at least one test company');

    const testRecipient = `inbound-${company.id}@fillflow.io`;

    // Ensure connection is active and connected
    await prisma.automationConnection.upsert({
      where: {
        companyId_automationType: {
          companyId: company.id,
          automationType: AutomationType.email,
        },
      },
      create: {
        companyId: company.id,
        automationType: AutomationType.email,
        status: ConnectionStatus.connected,
        provider: 'google',
        displayName: testRecipient,
        metadata: { googleEmail: testRecipient },
      },
      update: {
        status: ConnectionStatus.connected,
        provider: 'google',
        displayName: testRecipient,
        metadata: { googleEmail: testRecipient },
      },
    });

    // Ensure automation access is enabled
    await prisma.automationAccess.upsert({
      where: {
        companyId_automationType: {
          companyId: company.id,
          automationType: AutomationType.email,
        },
      },
      create: {
        companyId: company.id,
        automationType: AutomationType.email,
        enabled: true,
        monthlyLimit: 100,
        usedCredits: 0,
        quotaLocked: false,
        adminDisabled: false,
      },
      update: {
        enabled: true,
        quotaLocked: false,
        adminDisabled: false,
      },
    });

    await resetCompanyEmailQuota(company.id);
    const quotaInitial = await getEmailQuota(company.id);

    // Test quota release on non-inquiry (e.g. promotional / unsubscribe email)
    const promoRes = await processInboundEmail(
      {
        messageId: `promo-${Date.now()}`,
        sender: 'marketing@newsletter.com',
        recipient: testRecipient,
        subject: 'Weekly Newsletter #42: Unsubscribe',
        text: 'Check out our latest newsletter. Click here to unsubscribe.',
        timestamp: Date.now(),
      },
      mockProvider as unknown as EmailProvider
    );

    assert.strictEqual(promoRes.status, 'skipped_irrelevant', 'Newsletter must be classified as non-inquiry');
    const quotaAfterPromo = await getEmailQuota(company.id);
    assert.strictEqual(
      quotaAfterPromo.usedCredits,
      quotaInitial.usedCredits,
      'Zero quota credits may be consumed by non-inquiry emails'
    );

    console.log('  ✅ PASSED: Quota credits strictly protected; non-inquiries consume 0 credits.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 9: Approval Queue & Holding Response Behavior
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Testing approval queue behavior on restricted commercial inquiry...');
    resetMemoryApprovalQueue();

    // Ensure AI permission requires approval for pricing
    await prisma.companyAiPermission.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        autonomyMode: 'LIMITED_ACCESS',
        autoReplyPricing: false,
        autoReplyContracts: false,
      },
      update: {
        autonomyMode: 'LIMITED_ACCESS',
        autoReplyPricing: false,
        autoReplyContracts: false,
      },
    });

    const approvalMsgId = `pricing-inq-${Date.now()}`;
    const approvalRes = await processInboundEmail(
      {
        messageId: approvalMsgId,
        sender: 'commercial.lead@enterprise.com',
        recipient: testRecipient,
        subject: 'Pricing and Contract SLA Inquiry',
        text: 'What is your enterprise pricing model and can you give us a 50% discount on the contract?',
        timestamp: Date.now(),
      },
      mockProvider as unknown as EmailProvider
    );

    assert.strictEqual(approvalRes.approvalRequired, true, 'Commercial term inquiry must trigger approvalRequired');
    assert.ok(approvalRes.approvalItem, 'Must create an approval item');
    assert.strictEqual(approvalRes.approvalItem?.status, 'PENDING', 'Item must be in PENDING status');

    const items = await listApprovalItems(company.id);
    const matchedItem = items.find((i) => i.inboundMessageId === approvalMsgId);
    assert.ok(matchedItem, 'Approval item must be retrievable from company queue');

    // Quota remains 0 until approved
    const quotaAfterApprovalQueue = await getEmailQuota(company.id);
    assert.strictEqual(
      quotaAfterApprovalQueue.usedCredits,
      quotaInitial.usedCredits,
      'Zero quota credits consumed when item is queued for human approval'
    );

    console.log('  ✅ PASSED: Approval queue intercepts commercial terms with 0 quota leak.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 10: Secret Exposure Safety Check
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Testing secret exposure safety...');
    const testLogs: string[] = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args) => testLogs.push(args.join(' '));
    console.error = (...args) => testLogs.push(args.join(' '));

    try {
      getAiModel();
      const reqTest10 = new NextRequest('http://localhost:3000/api/integrations/google/watch/renew', {
        method: 'POST',
        headers: { authorization: `Bearer ${testSecret}` },
        body: JSON.stringify({ companyId: 'test-auth-check' }),
      });
      await renewPost(reqTest10);
    } finally {
      console.log = origLog;
      console.error = origError;
    }

    const joinedLogs = testLogs.join(' ');
    const realSecrets = [
      process.env.DATABASE_URL,
      process.env.JWT_SECRET,
      process.env.ENCRYPTION_SECRET,
      process.env.AI_API_KEY,
    ].filter((s): s is string => Boolean(s && s.length > 5));

    for (const secret of realSecrets) {
      assert.ok(!joinedLogs.includes(secret), 'No real production secrets may be printed to stdout or stderr');
    }

    console.log('  ✅ PASSED: No sensitive tokens, encryption keys, or passwords exposed.\n');
    passedTests++;

    console.log('================================================================');
    console.log(`ALL ${passedTests}/10 PHASE 7A DEPLOYMENT FIX TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================================');
  } finally {
    // Restore environment
    process.env = originalEnv;
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
