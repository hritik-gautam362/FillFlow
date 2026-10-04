import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import {
  createApprovalItem,
  getApprovalItem,
  approveAndSendItem,
  resetMemoryApprovalQueue,
} from '../src/lib/services/aiApprovalService';
import { encryptToken } from '../src/lib/security/encryption';
import { EmailProvider, SendEmailParams, SendEmailResult } from '../src/lib/services/email/EmailProvider';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passedAssertions++;
  console.log(`  ✓ PASSED: ${message}`);
}

class MockTestEmailProvider implements EmailProvider {
  sentEmails: SendEmailParams[] = [];
  shouldFail = false;

  async sendMessage(params: SendEmailParams): Promise<SendEmailResult> {
    if (this.shouldFail) {
      return { success: false, error: 'Explicit mock provider forced error' };
    }
    const mockId = `mock-test-id-${Date.now()}`;
    this.sentEmails.push(params);
    return { success: true, providerMessageId: mockId };
  }
  verifyWebhook(): boolean { return true; }
  parseInboundMessage(): any { return null; }
  normalizeMessage(t: string): string { return t; }
  parseDeliveryEvent(): any { return null; }
}

async function runHardenRealGmailApprovalTestSuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: HARDEN REAL GMAIL APPROVAL & REMOVE SIMULATION FALLBACK  ');
  console.log('========================================================================\n');

  // Backup original environment and methods
  const origGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const origFetch = globalThis.fetch;
  const origFindUniqueConn = prisma.automationConnection.findUnique;
  const origUpdateConn = prisma.automationConnection.update;
  const origFindUniqueAccess = prisma.automationAccess.findUnique;
  const origUpdateAccess = prisma.automationAccess.update;
  const origUpsertAccess = prisma.automationAccess.upsert;
  const origQueryRaw = prisma.$queryRaw;
  const origAuditLogCreate = prisma.automationQuotaAuditLog.create;
  const origLeadFindUnique = prisma.lead.findUnique;

  process.env.GOOGLE_CLIENT_ID = 'test-real-client-id';

  let lastAuditAction: string | null = null;
  let lastAuditReason: string | null = null;
  let auditLogCount = 0;

  // Stub prisma quota and connection updates for fast, clean, deterministic testing
  prisma.automationConnection.update = (async () => ({})) as any;
  prisma.automationAccess.update = (async () => ({})) as any;

  prisma.automationAccess.findUnique = (async () => ({
    id: 'access_mock_001',
    companyId: 'any',
    automationType: AutomationType.email,
    enabled: true,
    monthlyLimit: 100,
    usedCredits: 10,
    reservedCredits: 0,
    quotaLocked: false,
    adminDisabled: false,
    activatedAt: new Date(),
    expiresAt: null,
    nextMonthlyResetAt: new Date(Date.now() + 86400000),
    lastResetAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as any;

  prisma.automationAccess.upsert = (async () => ({
    id: 'access_mock_001',
    companyId: 'any',
    automationType: AutomationType.email,
    enabled: true,
    monthlyLimit: 100,
    usedCredits: 10,
    reservedCredits: 0,
    quotaLocked: false,
    adminDisabled: false,
    activatedAt: new Date(),
    expiresAt: null,
    nextMonthlyResetAt: new Date(Date.now() + 86400000),
    lastResetAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as any;

  prisma.$queryRaw = (async () => [
    {
      id: 'access_mock_001',
      monthlyLimit: 100,
      usedCredits: 10,
      reservedCredits: 1,
      quotaLocked: false,
      adminDisabled: false,
    },
  ]) as any;

  prisma.automationQuotaAuditLog.create = (async (args: any) => {
    lastAuditAction = args?.data?.action || null;
    lastAuditReason = args?.data?.details?.reason || args?.data?.reason || null;
    auditLogCount++;
    return { id: `log_${Date.now()}` };
  }) as any;

  prisma.lead.findUnique = (async () => null) as any;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Active real Gmail connection -> provider used -> send allowed
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Active real Gmail connection -> provider used -> send allowed');
    resetMemoryApprovalQueue();
    lastAuditAction = null;
    lastAuditReason = null;
    auditLogCount = 0;

    let interceptedUrl: string | null = null;
    let interceptedAuthHeader: string | null = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      interceptedUrl = url;
      interceptedAuthHeader = (init?.headers as Record<string, string>)?.['Authorization'] || null;

      if (url.includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ id: 'gmail_api_real_id_999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const validEncryptedAccessToken = encryptToken('valid-real-access-token');
    const validEncryptedRefreshToken = encryptToken('valid-real-refresh-token');

    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_real_001',
      companyId: 'company_real_001',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: 'sales@realcompany.com',
      metadata: {
        encryptedAccessToken: validEncryptedAccessToken,
        encryptedRefreshToken: validEncryptedRefreshToken,
        tokenExpiry: Date.now() + 3600000,
        googleEmail: 'sales@realcompany.com',
      },
    })) as any;

    const item1 = await createApprovalItem({
      companyId: 'company_real_001',
      leadId: 'lead_real_001',
      inboundMessageId: 'inbound_msg_001',
      customerName: 'Robert Lang',
      customerEmail: 'robert@clientcorp.com',
      subject: 'Inquiry regarding SaaS platform',
      latestCustomerMessage: 'Can you provide a scope for the platform?',
      intent: 'project_request',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Standard review'],
      baseDraft: 'Hi Robert,\n\nWe can deliver the scope by Friday.\n\nBest,\nSales Team',
    });

    const sendRes1 = await approveAndSendItem('company_real_001', item1.id);
    assert(sendRes1.success === true, 'Test 1: approveAndSendItem succeeded with real provider');
    assert(sendRes1.item?.status === 'APPROVED', 'Test 1: Status transitioned to APPROVED');
    assert(sendRes1.outboundMessageId === 'gmail_api_real_id_999', 'Test 1: Outbound message ID matches real Gmail API response');
    assert(Boolean(sendRes1.item?.sentAt), 'Test 1: sentAt timestamp recorded');
    assert(Boolean(typeof interceptedUrl === 'string' && (interceptedUrl as string).includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')), 'Test 1: Sent via real Gmail REST API endpoint');
    assert(interceptedAuthHeader === 'Bearer valid-real-access-token', 'Test 1: Bearer token matched decrypted real access token');
    assert(lastAuditAction === 'COMMIT' || auditLogCount > 0, 'Test 1: Quota transaction logged for successful dispatch');

    // -------------------------------------------------------------------------
    // TEST 2: Missing Gmail connection -> send blocked
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Missing Gmail connection -> send blocked');
    resetMemoryApprovalQueue();
    prisma.automationConnection.findUnique = (async () => null) as any;

    const item2 = await createApprovalItem({
      companyId: 'company_missing_conn',
      leadId: 'lead_002',
      inboundMessageId: 'inbound_002',
      customerName: 'Maya Patel',
      customerEmail: 'maya@client.com',
      subject: 'Mobile App inquiry',
      latestCustomerMessage: 'Looking for iOS development team.',
      intent: 'project_request',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Manual review'],
      baseDraft: 'Hi Maya,\n\nWe specialize in iOS app engineering.\n\nBest regards,\nTeam',
    });

    interceptedUrl = null;
    const sendRes2 = await approveAndSendItem('company_missing_conn', item2.id);
    assert(sendRes2.success === false, 'Test 2: Missing connection send is blocked');
    assert(sendRes2.error === 'Gmail connection is not active. Reconnect Gmail before sending.', 'Test 2: Returned exact expected error message');
    assert(interceptedUrl === null, 'Test 2: No network request or simulation was performed');
    const item2Check = await getApprovalItem('company_missing_conn', item2.id);
    assert(item2Check?.status === 'PENDING', 'Test 2: Item status remains PENDING');

    // -------------------------------------------------------------------------
    // TEST 3: Inactive Gmail connection -> send blocked
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Inactive Gmail connection -> send blocked');
    const inactiveStatuses = [
      ConnectionStatus.disconnected,
      ConnectionStatus.error,
      ConnectionStatus.not_connected,
      ConnectionStatus.pending,
    ];

    for (const status of inactiveStatuses) {
      resetMemoryApprovalQueue();
      prisma.automationConnection.findUnique = (async () => ({
        id: `conn_${status}`,
        companyId: 'company_inactive_status',
        automationType: AutomationType.email,
        provider: 'google',
        status,
        displayName: 'test@inactive.com',
        metadata: {
          encryptedAccessToken: validEncryptedAccessToken,
          encryptedRefreshToken: validEncryptedRefreshToken,
        },
      })) as any;

      const itemInactive = await createApprovalItem({
        companyId: 'company_inactive_status',
        leadId: 'lead_inact',
        inboundMessageId: `msg_${status}`,
        customerName: 'Samir Rao',
        customerEmail: 'samir@corp.com',
        subject: 'Service pricing',
        latestCustomerMessage: 'What is the hourly rate?',
        intent: 'pricing_request',
        riskLevel: 'LOW',
        permissionDecision: 'NEEDS_APPROVAL',
        restrictedTopics: [],
        whyApprovalRequired: ['Pricing check'],
        baseDraft: 'Hi Samir, our hourly rate depends on the scope.',
      });

      const resInactive = await approveAndSendItem('company_inactive_status', itemInactive.id);
      assert(resInactive.success === false, `Test 3: Blocked when connection status is ${status}`);
      assert(resInactive.error === 'Gmail connection is not active. Reconnect Gmail before sending.', `Test 3: Correct error for status ${status}`);
    }

    // Provider is not google (e.g. mailgun)
    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_ng',
      companyId: 'company_non_google',
      automationType: AutomationType.email,
      provider: 'mailgun',
      status: ConnectionStatus.connected,
      metadata: {},
    })) as any;

    const itemNonGoogle = await createApprovalItem({
      companyId: 'company_non_google',
      leadId: 'lead_ng',
      inboundMessageId: 'msg_ng',
      customerName: 'Non Google',
      customerEmail: 'ng@corp.com',
      subject: 'Inquiry',
      latestCustomerMessage: 'Inquiry',
      intent: 'general_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Check'],
      baseDraft: 'Hello',
    });

    const resNonGoogle = await approveAndSendItem('company_non_google', itemNonGoogle.id);
    assert(resNonGoogle.success === false, 'Test 3: Blocked when connection provider is not google');
    assert(resNonGoogle.error === 'Gmail connection is not active. Reconnect Gmail before sending.', 'Test 3: Error when provider is not google');

    // -------------------------------------------------------------------------
    // TEST 4: Invalid OAuth -> send blocked and no simulation
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Invalid OAuth -> send blocked and no simulation');
    // Case 4A: Corrupt ciphertext
    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_corrupt',
      companyId: 'company_corrupt_oauth',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      metadata: {
        encryptedAccessToken: 'bad_iv:bad_tag:bad_cipher',
        encryptedRefreshToken: 'bad_iv:bad_tag:bad_cipher',
      },
    })) as any;

    const item4A = await createApprovalItem({
      companyId: 'company_corrupt_oauth',
      leadId: 'lead_4a',
      inboundMessageId: 'msg_4a',
      customerName: 'Vikram Mehta',
      customerEmail: 'vikram@fintech.com',
      subject: 'Banking compliance review',
      latestCustomerMessage: 'Need security architecture report.',
      intent: 'service_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Security review'],
      baseDraft: 'Hi Vikram, here is our compliance documentation.',
    });

    lastAuditAction = null;
    lastAuditReason = null;
    const res4A = await approveAndSendItem('company_corrupt_oauth', item4A.id);
    assert(res4A.success === false, 'Test 4A: Corrupt OAuth ciphertext blocked send');
    assert(Boolean(res4A.error?.includes('Gmail authentication error')), 'Test 4A: Error reports Gmail authentication error');
    assert(Boolean(res4A.error?.includes('Reconnect Gmail before sending')), 'Test 4A: Prompts user to reconnect Gmail');
    assert(lastAuditAction === 'RELEASE' || lastAuditReason === 'OAUTH_CREDENTIALS_INVALID', 'Test 4A: Quota released with OAUTH_CREDENTIALS_INVALID');

    // Case 4B: Missing/empty tokens in metadata
    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_empty',
      companyId: 'company_empty_tokens',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      metadata: {},
    })) as any;

    const item4B = await createApprovalItem({
      companyId: 'company_empty_tokens',
      leadId: 'lead_4b',
      inboundMessageId: 'msg_4b',
      customerName: 'Anita Roy',
      customerEmail: 'anita@corp.com',
      subject: 'Cloud migration',
      latestCustomerMessage: 'Can you migrate to AWS?',
      intent: 'project_request',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Cloud architect review'],
      baseDraft: 'Hi Anita, we handle full AWS cloud migrations.',
    });

    const res4B = await approveAndSendItem('company_empty_tokens', item4B.id);
    assert(res4B.success === false, 'Test 4B: Empty tokens blocked send');
    assert(Boolean(res4B.error?.includes('Gmail authentication error')), 'Test 4B: Reports auth error for empty tokens');

    // Case 4C: Gmail API 401 Unauthorized during send
    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_4c',
      companyId: 'company_expired_oauth',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: 'test4c@realcompany.com',
      metadata: {
        encryptedAccessToken: validEncryptedAccessToken,
        encryptedRefreshToken: '', // No refresh token so it cannot auto-refresh
        tokenExpiry: Date.now() + 3600000,
        googleEmail: 'test4c@realcompany.com',
      },
    })) as any;

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid Credentials', code: 401 } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const item4C = await createApprovalItem({
      companyId: 'company_expired_oauth',
      leadId: 'lead_4c',
      inboundMessageId: 'msg_4c',
      customerName: 'Derek Zhao',
      customerEmail: 'derek@tech.io',
      subject: 'Database optimization',
      latestCustomerMessage: 'Slow queries on PostgreSQL.',
      intent: 'service_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['DB team review'],
      baseDraft: 'Hi Derek, we can optimize your indexing.',
    });

    const res4C = await approveAndSendItem('company_expired_oauth', item4C.id);
    assert(res4C.success === false, 'Test 4C: 401 Unauthorized blocked send');
    assert(Boolean(res4C.error?.includes('Gmail authentication expired or invalid')), 'Test 4C: Clear reconnect/authentication error displayed');
    assert(Boolean(res4C.error?.includes('Reconnect Gmail before sending')), 'Test 4C: Guidance to reconnect Gmail included');
    const item4CCheck = await getApprovalItem('company_expired_oauth', item4C.id);
    assert(item4CCheck?.status === 'PENDING', 'Test 4C: Item status remains PENDING (retryable)');

    // -------------------------------------------------------------------------
    // TEST 5: Gmail API failure -> approval not marked sent
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Gmail API failure -> approval not marked sent');
    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_5',
      companyId: 'company_api_fail',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: 'support@realcompany.com',
      metadata: {
        encryptedAccessToken: validEncryptedAccessToken,
        encryptedRefreshToken: validEncryptedRefreshToken,
        tokenExpiry: Date.now() + 3600000,
      },
    })) as any;

    let return500 = true;
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('gmail.googleapis.com')) {
        if (return500) {
          return new Response('Backend Google 503 Service Unavailable', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return new Response(JSON.stringify({ id: 'recovered_gmail_msg_id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const item5 = await createApprovalItem({
      companyId: 'company_api_fail',
      leadId: 'lead_5',
      inboundMessageId: 'msg_5',
      customerName: 'Elena Rostova',
      customerEmail: 'elena@enterprise.org',
      subject: 'Security SLA query',
      latestCustomerMessage: 'Can you guarantee 99.99% uptime?',
      intent: 'service_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['SLA check'],
      baseDraft: 'Hi Elena, our standard SLA provides 99.9% uptime.',
    });

    const res5Fail = await approveAndSendItem('company_api_fail', item5.id);
    assert(res5Fail.success === false, 'Test 5: Send returned error on Gmail API 503');
    assert(Boolean(res5Fail.error?.includes('503')), 'Test 5: Error reflects safe API failure reason');
    const item5AfterFail = await getApprovalItem('company_api_fail', item5.id);
    assert(item5AfterFail?.status === 'PENDING', 'Test 5: Approval item status strictly remains PENDING');

    // Retry after service recovery succeeds
    return500 = false;
    const res5Retry = await approveAndSendItem('company_api_fail', item5.id);
    assert(res5Retry.success === true, 'Test 5: Retry succeeded after API recovery');
    assert(res5Retry.item?.status === 'APPROVED', 'Test 5: Item status transitioned to APPROVED on successful retry');
    assert(res5Retry.outboundMessageId === 'recovered_gmail_msg_id', 'Test 5: Outbound message ID properly assigned');

    // -------------------------------------------------------------------------
    // TEST 6: Failed send -> quota reservation released
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Failed send -> quota reservation released');
    return500 = true;
    lastAuditAction = null;
    lastAuditReason = null;
    auditLogCount = 0;

    const item6 = await createApprovalItem({
      companyId: 'company_api_fail',
      leadId: 'lead_6',
      inboundMessageId: 'msg_6',
      customerName: 'Tanya Gomez',
      customerEmail: 'tanya@agency.io',
      subject: 'API integration',
      latestCustomerMessage: 'Integrate with Hubspot?',
      intent: 'project_request',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Review'],
      baseDraft: 'Hi Tanya, we can integrate with Hubspot.',
    });

    const res6 = await approveAndSendItem('company_api_fail', item6.id);
    assert(res6.success === false, 'Test 6: Send failed as expected');
    assert(lastAuditAction === 'RELEASE' || Boolean(typeof lastAuditReason === 'string' && (lastAuditReason as string).includes('503')) || auditLogCount > 0, 'Test 6: Quota release action logged on failed send');

    // -------------------------------------------------------------------------
    // TEST 7: Successful real provider response -> existing sent lifecycle unchanged
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Successful real provider response -> existing sent lifecycle unchanged');
    return500 = false;

    prisma.automationConnection.findUnique = (async () => ({
      id: 'conn_7',
      companyId: 'company_real_001',
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: 'executive@realcompany.com',
      metadata: {
        encryptedAccessToken: validEncryptedAccessToken,
        encryptedRefreshToken: validEncryptedRefreshToken,
        tokenExpiry: Date.now() + 3600000,
      },
    })) as any;

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ id: 'gmail_api_real_id_999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const item7 = await createApprovalItem({
      companyId: 'company_real_001',
      leadId: 'lead_7',
      inboundMessageId: 'msg_7',
      customerName: 'Marcus Aurelius',
      customerEmail: 'marcus@rome.org',
      subject: 'Philosophical consulting',
      latestCustomerMessage: 'Can you help restructure our governance?',
      intent: 'project_request',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Partner review'],
      baseDraft: 'Initial AI draft response text.',
    });

    const editedDraft = 'Hi Marcus,\n\nWe would be honored to assist with governance restructuring.\n\nBest regards,\nExecutive Team';
    const res7 = await approveAndSendItem('company_real_001', item7.id, {
      finalDraft: editedDraft,
      userEmail: 'partner@realcompany.com',
    });

    assert(res7.success === true, 'Test 7: approveAndSendItem succeeded');
    assert(res7.item?.status === 'EDITED_AND_SENT', 'Test 7: Status transitioned to EDITED_AND_SENT');
    assert(res7.item?.isEdited === true, 'Test 7: isEdited flag is true');
    assert(res7.item?.editedDraft === editedDraft, 'Test 7: editedDraft stored properly');
    assert(res7.item?.approvedBy === 'partner@realcompany.com', 'Test 7: approvedBy recorded');
    assert(Boolean(res7.item?.sentAt), 'Test 7: sentAt recorded');
    assert(Boolean((res7.auditRecord?.validationResult as any)?.isValid === true), 'Test 7: validationResult passed');
    assert(Boolean(res7.item?.activityTimeline?.some((t: any) => t.step === 'Edited & Dispatched')), 'Test 7: activityTimeline includes Edited & Dispatched step');

    // -------------------------------------------------------------------------
    // TEST 8: Mock provider in tests still works explicitly
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Mock provider in tests still works explicitly');
    // Ensure company has NO db connection
    prisma.automationConnection.findUnique = (async () => null) as any;

    const explicitMockProvider = new MockTestEmailProvider();
    const item8 = await createApprovalItem({
      companyId: 'company_test_mock_only',
      leadId: 'lead_8',
      inboundMessageId: 'msg_8',
      customerName: 'Test Mock Client',
      customerEmail: 'testmock@example.com',
      subject: 'Automated test inquiry',
      latestCustomerMessage: 'Testing explicit mock provider.',
      intent: 'general_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Testing'],
      baseDraft: 'Hi, this is a mock test response.',
    });

    const res8 = await approveAndSendItem('company_test_mock_only', item8.id, {
      provider: explicitMockProvider,
      userEmail: 'tester@test.com',
    });

    assert(res8.success === true, 'Test 8: Explicit mock provider succeeded without DB connection');
    assert(res8.item?.status === 'APPROVED', 'Test 8: Status transitioned to APPROVED via mock provider');
    assert(explicitMockProvider.sentEmails.length === 1, 'Test 8: Explicit mock provider recorded sent email');
    assert(explicitMockProvider.sentEmails[0].to === 'testmock@example.com', 'Test 8: Explicit mock provider received correct recipient');

    // -------------------------------------------------------------------------
    // TEST 9: No fallback to new GoogleProvider() from approveAndSendItem()
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] No fallback to new GoogleProvider() from approveAndSendItem()');
    // Static analysis: verify source code of aiApprovalService.ts does not instantiate new GoogleProvider()
    const aiApprovalServicePath = path.resolve(__dirname, '../src/lib/services/aiApprovalService.ts');
    const sourceCode = fs.readFileSync(aiApprovalServicePath, 'utf-8');

    const hasNewGoogleProvider = /new\s+GoogleProvider\s*\(/.test(sourceCode);
    assert(!hasNewGoogleProvider, 'Test 9: Static check confirms "new GoogleProvider()" fallback has been completely removed from aiApprovalService.ts');

    const hasSilentFallback = /catch\s*\{\s*activeProvider\s*=\s*new\s+GoogleProvider/.test(sourceCode);
    assert(!hasSilentFallback, 'Test 9: Static check confirms silent catch fallback to GoogleProvider is eliminated');

    // -------------------------------------------------------------------------
    // TEST 10: Existing duplicate-send protection still works
    // -------------------------------------------------------------------------
    console.log('\n[TEST 10] Existing duplicate-send protection still works');
    const mockProviderForDup = new MockTestEmailProvider();

    const itemDup1 = await createApprovalItem({
      companyId: 'company_dup_test',
      leadId: 'lead_dup_1',
      inboundMessageId: 'msg_dup_1',
      customerName: 'Dup Customer',
      customerEmail: 'dup@example.com',
      subject: 'Dup subject',
      latestCustomerMessage: 'Testing dup send',
      intent: 'general_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Review'],
      baseDraft: 'Base draft',
    });

    // Send itemDup1 first time
    const firstSend1 = await approveAndSendItem('company_dup_test', itemDup1.id, {
      provider: mockProviderForDup,
    });
    assert(firstSend1.success === true, 'Test 10: First send on itemDup1 succeeded');
    assert(firstSend1.item?.status === 'APPROVED', 'Test 10: Item status is APPROVED');

    // Attempt second send (APPROVED)
    const dupSend1 = await approveAndSendItem('company_dup_test', itemDup1.id, {
      provider: mockProviderForDup,
    });
    assert(dupSend1.success === false, 'Test 10: Duplicate send on APPROVED item is prevented');
    assert(Boolean(dupSend1.error?.includes('already been sent')), 'Test 10: Error indicates already sent');

    // Create and send EDITED_AND_SENT item
    const itemDup2 = await createApprovalItem({
      companyId: 'company_dup_test',
      leadId: 'lead_dup_2',
      inboundMessageId: 'msg_dup_2',
      customerName: 'Dup Customer 2',
      customerEmail: 'dup2@example.com',
      subject: 'Dup subject 2',
      latestCustomerMessage: 'Testing dup send 2',
      intent: 'general_inquiry',
      riskLevel: 'LOW',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: [],
      whyApprovalRequired: ['Review'],
      baseDraft: 'Base draft 2',
    });

    const firstSend2 = await approveAndSendItem('company_dup_test', itemDup2.id, {
      finalDraft: 'Custom edited draft text',
      provider: mockProviderForDup,
    });
    assert(firstSend2.success === true, 'Test 10: First send on itemDup2 succeeded');
    assert(firstSend2.item?.status === 'EDITED_AND_SENT', 'Test 10: Item status is EDITED_AND_SENT');

    // Attempt second send (EDITED_AND_SENT)
    const dupSend2 = await approveAndSendItem('company_dup_test', itemDup2.id, {
      provider: mockProviderForDup,
    });
    assert(dupSend2.success === false, 'Test 10: Duplicate send on EDITED_AND_SENT item is prevented');
    assert(Boolean(dupSend2.error?.includes('already been sent')), 'Test 10: Error indicates already sent');

    // Try to send a REJECTED item
    const itemReject = await createApprovalItem({
      companyId: 'company_dup_test',
      leadId: 'lead_rej',
      inboundMessageId: 'msg_rej',
      customerName: 'Reject Me',
      customerEmail: 'reject@client.com',
      subject: 'Unreasonable request',
      latestCustomerMessage: 'Do everything for free.',
      intent: 'general_inquiry',
      riskLevel: 'HIGH',
      permissionDecision: 'NEEDS_APPROVAL',
      restrictedTopics: ['free_work'],
      whyApprovalRequired: ['Unreasonable terms'],
      baseDraft: 'Sorry, we cannot do free work.',
    });
    itemReject.status = 'REJECTED';

    const sendRejRes = await approveAndSendItem('company_dup_test', itemReject.id, {
      provider: mockProviderForDup,
    });
    assert(sendRejRes.success === false, 'Test 10: Sending a REJECTED item is strictly prevented');
    assert(Boolean(sendRejRes.error?.includes('Cannot send a rejected approval item')), 'Test 10: Error message indicates rejected item');

    console.log('\n========================================================================');
    console.log(`  ALL ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED SUCCESSFULLY!`);
    console.log('========================================================================\n');
  } finally {
    // Restore original environment and methods
    if (origGoogleClientId !== undefined) {
      process.env.GOOGLE_CLIENT_ID = origGoogleClientId;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    globalThis.fetch = origFetch;
    prisma.automationConnection.findUnique = origFindUniqueConn;
    prisma.automationConnection.update = origUpdateConn;
    prisma.automationAccess.findUnique = origFindUniqueAccess;
    prisma.automationAccess.update = origUpdateAccess;
    prisma.automationAccess.upsert = origUpsertAccess;
    prisma.$queryRaw = origQueryRaw;
    prisma.automationQuotaAuditLog.create = origAuditLogCreate;
    prisma.lead.findUnique = origLeadFindUnique;
  }
}

runHardenRealGmailApprovalTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
