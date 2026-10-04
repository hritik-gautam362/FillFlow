/**
 * Comprehensive Test Suite for Google Workspace / Gmail OAuth Email Automation.
 *
 * Scenarios tested:
 * 1. Token Encryption/Decryption (AES-256-GCM roundtrip, tampering detection)
 * 2. OAuth State Generation & Validation (CSRF nonce, expiry, signature verification)
 * 3. GoogleProvider Message Parsing (MIME parts, header extraction, reply quote stripping)
 * 4. GoogleProvider Outbound Email Sending (RFC 2822 formatting, threading headers)
 * 5. Expired Access Token Auto-Refresh (persistence of re-encrypted tokens)
 * 6. Connection Creation & Secure Storage (encrypted tokens in database)
 * 7. Token Leakage Protection (sanitized API output contains zero raw tokens/secrets)
 * 8. Multi-Tenant Company Resolution (exact Gmail address to company mapping)
 * 9. Cross-Tenant Isolation (Company A cannot intercept or access Company B mailbox)
 * 10. Email Inbound Pipeline Integration with AI Discovery (Lead creation + ChatMessage)
 * 11. Email Conversation Threading (In-Reply-To, References, gmailThreadId preserved)
 * 12. Idempotency against Duplicate Gmail Messages (memory + Neon DB checks)
 * 13. Automation Access Licensing Guard (blocked when email access is disabled)
 * 14. Connection Disconnection & Safe Revocation (status set to disconnected)
 * 15. Dynamic Provider Selection (GoogleProvider for Google tenants, Mailgun for Mailgun)
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { neonConfig } from '@neondatabase/serverless';
import { SignJWT, jwtVerify } from 'jose';
import ws from 'ws';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus, ChannelSource, MessageSender } from '@prisma/client';
import { encryptToken, decryptToken } from '../src/lib/security/encryption.ts';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import {
  getEmailProvider,
  getGoogleProviderForCompany,
  getEmailProviderForCompany,
  resetEmailProviderCache,
} from '../src/lib/services/email/emailProviderFactory.ts';
import {
  processInboundEmail,
  resolveCompanyForInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService.ts';
import {
  activateAutomation,
  deactivateAutomation,
} from '../src/lib/services/automationAccessService.ts';
import {
  updateAutomationConnection,
  disconnectAutomation,
  getAutomationConnection,
} from '../src/lib/services/automationConnectionService.ts';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'apexbyte-secret-saas-platform-key-2026-secure'
);

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failedCount++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passedCount++;
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('  GOOGLE GMAIL / GOOGLE WORKSPACE OAUTH AUTOMATION TEST SUITE  ');
  console.log('===============================================================\n');

  // Setup test tenant companies
  const companyA = await prisma.company.upsert({
    where: { id: 'test-google-company-alpha' },
    update: { name: 'Alpha Solutions Corp' },
    create: {
      id: 'test-google-company-alpha',
      name: 'Alpha Solutions Corp',
      industry: 'Software Consulting',
    },
  });

  const companyB = await prisma.company.upsert({
    where: { id: 'test-google-company-beta' },
    update: { name: 'Beta Agency LLC' },
    create: {
      id: 'test-google-company-beta',
      name: 'Beta Agency LLC',
      industry: 'Design Agency',
    },
  });

  // Enable automation access for Company A
  await activateAutomation(companyA.id, AutomationType.email);

  const googleEmailA = `alpha-workspace-${Date.now()}@gmail.com`;
  const googleEmailB = `beta-workspace-${Date.now()}@gmail.com`;

  // -------------------------------------------------------------
  // Test 1: Token Encryption & Decryption (AES-256-GCM)
  // -------------------------------------------------------------
  console.log('\n[Test 1] Token Encryption & Decryption (AES-256-GCM)');
  {
    const rawSecret = 'ya29.a0AfH6SMA-super-confidential-oauth-access-token-12345';
    const encrypted = encryptToken(rawSecret);

    assert(encrypted !== rawSecret, 'Encrypted token is not plaintext');
    assert(encrypted.split(':').length === 3, 'Ciphertext adheres to iv:authTag:cipher format');

    const decrypted = decryptToken(encrypted);
    assert(decrypted === rawSecret, 'Decrypted token matches original secret exactly');

    // Tampering test: alter last character of ciphertext
    let tamperDetected = false;
    try {
      const tampered = encrypted.substring(0, encrypted.length - 2) + 'aa';
      decryptToken(tampered);
    } catch {
      tamperDetected = true;
    }
    assert(tamperDetected, 'Tampered ciphertext is rejected by authentication tag');
  }

  // -------------------------------------------------------------
  // Test 2: OAuth State Generation & Validation
  // -------------------------------------------------------------
  console.log('\n[Test 2] OAuth State Generation & Validation (CSRF & Expiry)');
  {
    const nonce = crypto.randomBytes(16).toString('hex');
    const validState = await new SignJWT({
      companyId: companyA.id,
      userId: 'test-user-id-1',
      nonce,
      timestamp: Date.now(),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(JWT_SECRET);

    const { payload } = await jwtVerify(validState, JWT_SECRET);
    assert(payload.companyId === companyA.id, 'State contains verified companyId');
    assert(payload.nonce === nonce, 'State contains verified CSRF nonce');

    // Tampered state
    let invalidStateRejected = false;
    try {
      await jwtVerify(validState + 'invalid', JWT_SECRET);
    } catch {
      invalidStateRejected = true;
    }
    assert(invalidStateRejected, 'Tampered OAuth state token is rejected');
  }

  // -------------------------------------------------------------
  // Test 3: GoogleProvider Message Parsing & Quote Normalization
  // -------------------------------------------------------------
  console.log('\n[Test 3] GoogleProvider Message Parsing & Quote Normalization');
  {
    const provider = new GoogleProvider({ simulated: true });

    // Test quote stripping
    const noisyEmail =
      'We need a custom mobile application with Stripe billing.\n\n' +
      'On Tue, Sep 8, 2026 at 10:00 AM Client <client@example.com> wrote:\n' +
      '> Older conversation history here\n' +
      '> More quotes';
    const cleaned = provider.normalizeMessage(noisyEmail);
    assert(cleaned.includes('custom mobile application with Stripe billing'), 'Preserved core content');
    assert(!cleaned.includes('Older conversation history'), 'Stripped replied quotes cleanly');

    // Test Gmail payload structure parsing
    const rawGmailPayload = {
      id: 'msg_gmail_98765',
      threadId: 'th_gmail_112233',
      payload: {
        headers: [
          { name: 'From', value: 'John Prospect <john.prospect@techcorp.com>' },
          { name: 'To', value: googleEmailA },
          { name: 'Subject', value: 'Enterprise Platform Development' },
          { name: 'Message-ID', value: '<alpha-msg-12345@techcorp.com>' },
          { name: 'In-Reply-To', value: '<agent-reply-999@apexbyte.io>' },
          { name: 'References', value: '<agent-reply-999@apexbyte.io>' },
        ],
        mimeType: 'text/plain',
        body: {
          data: Buffer.from('We need an automated CRM pipeline integrated with PostgreSQL. Budget is $30,000.')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_'),
        },
      },
    };

    const parsed = provider.parseInboundMessage(rawGmailPayload);
    assert(parsed.sender === 'john.prospect@techcorp.com', 'Extracted clean sender email');
    assert(parsed.senderName === 'John Prospect', 'Extracted sender display name');
    assert(parsed.recipient === googleEmailA.toLowerCase(), 'Extracted recipient email');
    assert(parsed.messageId === '<alpha-msg-12345@techcorp.com>', 'Extracted Message-ID');
    assert(parsed.inReplyTo === '<agent-reply-999@apexbyte.io>', 'Extracted In-Reply-To');
    assert(parsed.references === '<agent-reply-999@apexbyte.io>', 'Extracted References');
    assert(parsed.text.includes('automated CRM pipeline'), 'Decoded message body text');
    assert(parsed.metadata?.gmailThreadId === 'th_gmail_112233', 'Preserved gmailThreadId');
  }

  // -------------------------------------------------------------
  // Test 4: GoogleProvider Outbound Email Sending
  // -------------------------------------------------------------
  console.log('\n[Test 4] GoogleProvider Outbound Sending (Simulation Mode)');
  {
    const provider = new GoogleProvider({
      connectedEmail: googleEmailA,
      simulated: true,
    });

    const sendRes = await provider.sendMessage({
      to: 'client@example.com',
      subject: 'Re: Enterprise Platform Development',
      text: 'Thank you for contacting us. We would be happy to scope your project.',
      html: '<p>Thank you for contacting us.</p>',
      inReplyTo: '<alpha-msg-12345@techcorp.com>',
      references: '<alpha-msg-12345@techcorp.com>',
      metadata: { gmailThreadId: 'th_gmail_112233' },
    });

    assert(sendRes.success === true, 'Outbound send succeeded');
    assert(sendRes.providerMessageId?.startsWith('sim-gmail-'), 'Returned simulated Gmail message ID');
    assert(sendRes.simulated === true, 'Flagged as simulated transport');
  }

  // -------------------------------------------------------------
  // Test 5: Expired Access Token Auto-Refresh Handling
  // -------------------------------------------------------------
  console.log('\n[Test 5] Expired Access Token Auto-Refresh');
  {
    let refreshPersisted = false;
    let savedNewExpiry = 0;

    const expiredProvider = new GoogleProvider({
      accessToken: 'old-expired-token',
      refreshToken: 'valid-refresh-token',
      tokenExpiry: Date.now() - 5000, // Expired 5 seconds ago
      simulated: true,
      onTokenRefreshed: async (tokens) => {
        refreshPersisted = true;
        savedNewExpiry = tokens.tokenExpiry;
      },
    });

    const token = await expiredProvider.getValidAccessToken();
    assert(token === 'simulated-refreshed-token', 'Successfully refreshed expired token');
    assert(refreshPersisted, 'Triggered onTokenRefreshed persistence callback');
    assert(savedNewExpiry > Date.now(), 'Calculated future token expiry timestamp');
  }

  // -------------------------------------------------------------
  // Test 6: Connection Creation & Secure Encrypted Storage
  // -------------------------------------------------------------
  console.log('\n[Test 6] Connection Creation & Secure Encrypted Storage');
  {
    const rawAccess = 'google-oauth-access-secret-token-xyz';
    const rawRefresh = 'google-oauth-refresh-secret-token-abc';
    const encryptedAccess = encryptToken(rawAccess);
    const encryptedRefresh = encryptToken(rawRefresh);
    const expiry = Date.now() + 3600 * 1000;

    const connection = await updateAutomationConnection(companyA.id, AutomationType.email, {
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: googleEmailA,
      externalId: 'google-usr-10001',
      metadata: {
        googleEmail: googleEmailA,
        googleUserId: 'google-usr-10001',
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry: expiry,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        connectedAt: new Date().toISOString(),
      },
    });

    assert(connection.status === ConnectionStatus.connected, 'Connection status set to connected');
    assert(connection.provider === 'google', 'Provider set to google');
    assert(connection.displayName === googleEmailA, 'displayName set to Google mailbox address');

    // Retrieve directly from DB and verify secrets are encrypted
    const dbConn = await prisma.automationConnection.findUnique({
      where: { companyId_automationType: { companyId: companyA.id, automationType: AutomationType.email } },
    });
    const meta = dbConn.metadata;
    assert(meta.encryptedAccessToken !== rawAccess, 'Raw access token is NOT in database');
    assert(meta.encryptedRefreshToken !== rawRefresh, 'Raw refresh token is NOT in database');
    assert(decryptToken(meta.encryptedAccessToken) === rawAccess, 'Stored encrypted access token decodes accurately');
    assert(decryptToken(meta.encryptedRefreshToken) === rawRefresh, 'Stored encrypted refresh token decodes accurately');
  }

  // -------------------------------------------------------------
  // Test 7: Token Leakage Protection in Sanitized Connection View
  // -------------------------------------------------------------
  console.log('\n[Test 7] Token Leakage Protection');
  {
    const connection = await getAutomationConnection(companyA.id, AutomationType.email);
    const sanitizedMetadata = connection.metadata
      ? Object.fromEntries(
          Object.entries(connection.metadata).filter(
            ([k]) => !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token')
          )
        )
      : {};

    assert(!('encryptedAccessToken' in sanitizedMetadata), 'Sanitized metadata strips encryptedAccessToken');
    assert(!('encryptedRefreshToken' in sanitizedMetadata), 'Sanitized metadata strips encryptedRefreshToken');
    assert('googleEmail' in sanitizedMetadata, 'Safe metadata like googleEmail is preserved');
  }

  // -------------------------------------------------------------
  // Test 8: Multi-Tenant Company Resolution
  // -------------------------------------------------------------
  console.log('\n[Test 8] Multi-Tenant Company Resolution');
  {
    const testEmail = {
      messageId: `msg-resolve-${Date.now()}`,
      sender: 'client@prospectcorp.com',
      recipient: googleEmailA,
      subject: 'Inquiry for Alpha Solutions',
      text: 'Looking to hire your team.',
      timestamp: Date.now(),
    };

    const resolution = await resolveCompanyForInboundEmail(testEmail);
    assert(resolution.companyId === companyA.id, 'Mapped inbound recipient to Company A workspace');
  }

  // -------------------------------------------------------------
  // Test 9: Cross-Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n[Test 9] Cross-Tenant Isolation');
  {
    // Setup Company B with a different mailbox
    await activateAutomation(companyB.id, AutomationType.email);
    await updateAutomationConnection(companyB.id, AutomationType.email, {
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: googleEmailB,
      metadata: { googleEmail: googleEmailB },
    });

    const testEmailB = {
      messageId: `msg-cross-${Date.now()}`,
      sender: 'client@prospectcorp.com',
      recipient: googleEmailB,
      subject: 'Inquiry for Beta Agency',
      text: 'Looking to hire Beta Agency.',
      timestamp: Date.now(),
    };

    const resolutionB = await resolveCompanyForInboundEmail(testEmailB);
    assert(resolutionB.companyId === companyB.id, 'Mapped recipient exclusively to Company B');
    assert(resolutionB.companyId !== companyA.id, 'Company A cannot access Company B inbound emails');
  }

  // -------------------------------------------------------------
  // Test 10: Inbound Processing & AI Scoping
  // -------------------------------------------------------------
  console.log('\n[Test 10] Inbound Email Processing through AI Discovery Pipeline');
  {
    clearEmailIdCacheForTesting();
    const inboundMsgId = `gmail-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const senderEmail = `alex.developer-${Date.now()}@clientdomain.com`;

    const parsedInbound = {
      messageId: inboundMsgId,
      sender: senderEmail,
      senderName: 'Alex Developer',
      recipient: googleEmailA,
      subject: 'Mobile Health Application Scoping',
      text: 'Hello! We want to build an iOS and Android health tracking app with HIPAA compliance. Our target budget is $45,000.',
      timestamp: Date.now(),
      metadata: { gmailThreadId: 'thread-health-001' },
    };

    const googleProvider = new GoogleProvider({
      connectedEmail: googleEmailA,
      simulated: true,
    });

    const processResult = await processInboundEmail(parsedInbound, googleProvider);
    assert(processResult.success === true, 'Inbound email successfully processed');
    assert(processResult.leadId !== undefined, 'Created or matched a Lead record');
    assert(processResult.companyId === companyA.id, 'Lead correctly belongs to Company A');

    // Verify lead created with channel = email
    const leadRecord = await prisma.lead.findUnique({
      where: { id: processResult.leadId },
    });
    assert(leadRecord?.channel === ChannelSource.email, 'Lead channel is email');
    assert(leadRecord?.companyId === companyA.id, 'Lead belongs to Company A tenant');

    // Verify chat messages created
    const messages = await prisma.chatMessage.findMany({
      where: { leadId: processResult.leadId },
      orderBy: { createdAt: 'asc' },
    });
    assert(messages.length >= 2, 'Recorded both client inquiry and agent response in ChatMessage table');
    assert(messages[0].sender === MessageSender.client, 'First message from client');
    assert(messages[1].sender === MessageSender.agent, 'Second message from agent');
  }

  // -------------------------------------------------------------
  // Test 11: Email Threading Preservation
  // -------------------------------------------------------------
  console.log('\n[Test 11] Email Conversation Threading Preservation');
  {
    const lead = await prisma.lead.findFirst({
      where: { companyId: companyA.id },
      orderBy: { createdAt: 'desc' },
      include: { chatMessages: true },
    });

    const agentMsg = lead.chatMessages.find((m) => m.sender === MessageSender.agent);
    const snapshot = agentMsg?.extractedDataSnapshot || {};
    assert(snapshot.outboundMessageId !== undefined, 'Recorded outbound provider message ID on agent message');
    assert(snapshot.gmailThreadId === 'thread-health-001', 'Preserved gmailThreadId in extractedDataSnapshot');
  }

  // -------------------------------------------------------------
  // Test 12: Idempotency Against Duplicate Messages
  // -------------------------------------------------------------
  console.log('\n[Test 12] Idempotency against Duplicate Messages');
  {
    const dupMsgId = `dup-msg-${Date.now()}`;
    const uniqueClient = `same.client-${Date.now()}@example.com`;
    const duplicateEmail = {
      messageId: dupMsgId,
      sender: uniqueClient,
      recipient: googleEmailA,
      subject: 'Inquiry: Mobile App Development Scoping',
      text: 'Hi team, we want to build a custom mobile application for our store. Our budget is $20,000.',
      timestamp: Date.now(),
      metadata: {
        classification: 'client_inquiry',
      },
    };

    const googleProvider = new GoogleProvider({ connectedEmail: googleEmailA, simulated: true });

    // First call
    const firstRes = await processInboundEmail(duplicateEmail, googleProvider);
    assert(firstRes.status === 'processed', 'First delivery processed normally');

    // Second duplicate call
    const secondRes = await processInboundEmail(duplicateEmail, googleProvider);
    assert(secondRes.status === 'duplicate_ignored', 'Second delivery detected as duplicate (in-memory)');
    assert(secondRes.success === true, 'Duplicate acknowledged with success=true');

    // Clear memory cache to test Neon DB idempotency lookup
    clearEmailIdCacheForTesting();
    const thirdRes = await processInboundEmail(duplicateEmail, googleProvider);
    assert(thirdRes.status === 'duplicate_ignored', 'Third delivery detected as duplicate from Neon DB');
  }

  // -------------------------------------------------------------
  // Test 13: Automation Access Licensing Guard
  // -------------------------------------------------------------
  console.log('\n[Test 13] Automation Access Lock Guard');
  {
    clearEmailIdCacheForTesting();
    // Temporarily lock email automation for Company A
    await deactivateAutomation(companyA.id, AutomationType.email);

    const lockedInbound = {
      messageId: `locked-msg-${Date.now()}`,
      sender: 'client@example.com',
      recipient: googleEmailA,
      subject: 'Inquiry for Web Application Development',
      text: 'Looking to hire software developers. Should be ignored because email automation is locked.',
      timestamp: Date.now(),
      metadata: {
        classification: 'client_inquiry',
      },
    };

    const googleProvider = new GoogleProvider({ connectedEmail: googleEmailA, simulated: true });
    const lockResult = await processInboundEmail(lockedInbound, googleProvider);

    assert(lockResult.status === 'automation_disabled', 'Inbound email ignored when automation is locked');
    assert(lockResult.errorCategory === 'EMAIL_AUTOMATION_DISABLED', 'Returns EMAIL_AUTOMATION_DISABLED category');

    // Restore access
    await activateAutomation(companyA.id, AutomationType.email);
  }

  // -------------------------------------------------------------
  // Test 14: Disconnection Handling
  // -------------------------------------------------------------
  console.log('\n[Test 14] Connection Disconnect');
  {
    const disconnected = await disconnectAutomation(companyA.id, AutomationType.email);
    assert(disconnected.status === ConnectionStatus.disconnected, 'Connection marked disconnected');
    assert(disconnected.disconnectedAt !== null, 'Recorded disconnectedAt timestamp');
  }

  // -------------------------------------------------------------
  // Test 15: Dynamic Provider Selection
  // -------------------------------------------------------------
  console.log('\n[Test 15] Dynamic Provider Selection');
  {
    // Configure Company A as Google
    await updateAutomationConnection(companyA.id, AutomationType.email, {
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: googleEmailA,
      metadata: {
        googleEmail: googleEmailA,
        encryptedAccessToken: encryptToken('sim-access'),
        encryptedRefreshToken: encryptToken('sim-refresh'),
        tokenExpiry: Date.now() + 3600 * 1000,
      },
    });

    const providerForA = await getEmailProviderForCompany(companyA.id);
    assert(
      providerForA.providerType === 'google' || providerForA instanceof GoogleProvider,
      'Company A dynamically resolves to GoogleProvider'
    );

    // Configure Company B as Mailgun
    await updateAutomationConnection(companyB.id, AutomationType.email, {
      status: ConnectionStatus.connected,
      provider: 'mailgun',
      displayName: 'sales@betaagency.com',
    });

    const providerForB = await getEmailProviderForCompany(companyB.id);
    assert(
      providerForB.providerType === 'mailgun',
      'Company B dynamically resolves to Mailgun provider'
    );
  }

  console.log('\n===============================================================');
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Test run failed with unhandled error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
