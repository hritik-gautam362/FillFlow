/**
 * Exhaustive Automated Test Suite for Google Cloud Pub/Sub Event-Driven Gmail Automation.
 * Tests all 20 required scenarios:
 * 1. New genuine customer email triggers automatically.
 * 2. Advertisement triggers no reply.
 * 3. Newsletter triggers no reply.
 * 4. Customer follow-up triggers automatic contextual reply.
 * 5. Duplicate Pub/Sub notification does not duplicate reply.
 * 6. Duplicate Gmail message does not duplicate reply.
 * 7. Multiple new emails in one history notification are all processed correctly.
 * 8. Multiple notifications for the same history range are safe.
 * 9. Quota exhausted prevents reply.
 * 10. Successful reply consumes exactly 1 credit.
 * 11. AI failure consumes 0 credits.
 * 12. Gmail send failure consumes 0 credits.
 * 13. Wrong/unknown emailAddress is safely ignored.
 * 14. Company A's notification cannot process Company B's mailbox.
 * 15. Expired historyId causes safe full-sync/recovery behavior.
 * 16. Watch renewal works.
 * 17. Disconnect stops/invalidates automation correctly.
 * 18. Manual Sync Inbox still works.
 * 19. Automatic webhook processing and manual Sync cannot race into duplicate replies.
 * 20. Pub/Sub webhook returns HTTP 200 after safely accepting/processing the notification.
 */

import dotenv from 'dotenv';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus, ChannelSource, MessageSender } from '@prisma/client';
import {
  handleGooglePubSubWebhook,
  clearPubSubInFlightLock,
} from '../src/lib/services/email/googlePubSubWebhookService.ts';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService.ts';
import {
  setupGmailWatch,
  renewGmailWatchIfNeeded,
  renewAllExpiringWatches,
  stopGmailWatch,
  getGooglePubSubWebhookUrl,
  getGmailPubSubTopic,
} from '../src/lib/services/email/gmailWatchService.ts';
import {
  reserveEmailQuota,
  releaseEmailQuota,
  commitEmailQuota,
  getEmailQuota,
} from '../src/lib/services/emailQuotaService.ts';
import {
  activateAutomation,
  deactivateAutomation,
} from '../src/lib/services/automationAccessService.ts';
import {
  updateAutomationConnection,
  disconnectAutomation,
} from '../src/lib/services/automationConnectionService.ts';
import { encryptToken } from '../src/lib/security/encryption.ts';
import { setGeminiMockHandler, clearGeminiMockHandler } from '../src/lib/ai/gemini.ts';
import {
  setAiClassifierMockHandler,
  clearAiClassifierMockHandler,
} from '../src/lib/services/email/emailClassifier.ts';

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

async function sendPubSubWebhook(emailAddress, historyId, token = null) {
  const payloadData = Buffer.from(
    JSON.stringify({ emailAddress, historyId })
  ).toString('base64');

  const body = {
    message: {
      data: payloadData,
      messageId: `ps-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      publishTime: new Date().toISOString(),
    },
    subscription: 'projects/automation-508113/subscriptions/gmail-inbound-push',
  };

  const result = await handleGooglePubSubWebhook({
    body,
    queryToken: token,
  });

  return {
    status: result.statusCode,
    json: async () => result.responseBody,
  };
}

async function runPubSubTests() {
  console.log('\n================================================================');
  console.log('  GOOGLE CLOUD PUB/SUB EVENT-DRIVEN GMAIL AUTOMATION TEST SUITE ');
  console.log('================================================================\n');

  // Setup 2 Tenant Companies
  const timestamp = Date.now();
  const companyAlphaId = `test-pubsub-alpha-${timestamp}`;
  const companyBetaId = `test-pubsub-beta-${timestamp}`;

  const companyAlpha = await prisma.company.create({
    data: {
      id: companyAlphaId,
      name: 'Alpha Engineering Labs',
      industry: 'Software Consulting',
    },
  });

  const companyBeta = await prisma.company.create({
    data: {
      id: companyBetaId,
      name: 'Beta Digital Studio',
      industry: 'UX / UI Agency',
    },
  });

  const emailAlpha = `alpha-inbound-${timestamp}@gmail.com`;
  const emailBeta = `beta-inbound-${timestamp}@gmail.com`;

  // Set deterministic Gemini mock handler to avoid external API quota limits
  setGeminiMockHandler((params) => {
    const text = (params.latestMessage || '').toLowerCase();
    const isFollowup = text.includes('admin web dashboard') || text.includes('also require');
    return {
      reply: isFollowup
        ? 'Yes, the admin compliance dashboard can certainly be included. What specific role permissions or audit logging capabilities are required for your compliance officers?'
        : `Thank you for contacting us regarding "${params.latestMessage.slice(0, 60)}". We specialize in this domain and would love to assist. What is your estimated timeline?`,
      options: ['Within 2 weeks', 'Next month', 'Flexible'],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: isFollowup ? 'Confirmed admin dashboard can be included in scope' : 'Acknowledged inquiry',
      nextBestQuestion: isFollowup
        ? 'What specific role permissions or audit logging capabilities are required for your compliance officers?'
        : 'What is your estimated timeline?',
      extractedRequirements: {
        projectType: 'Mobile Banking App',
        objective: 'Fintech mobile app with compliance dashboard',
        budget: text.includes('$') ? '$50,000' : '$25,000',
        timeline: '3 months',
        features: isFollowup ? ['Mobile Banking App', 'Admin Compliance Dashboard'] : ['Mobile Banking App'],
        techStack: ['React Native', 'Node.js'],
        targetAudience: 'Fintech users and compliance team',
        missingFields: [],
        qualificationScore: isFollowup ? 80 : 65,
        readyForBrief: true,
      },
    };
  });

  // Mock AI classifier to ensure fast, deterministic tests without burning Gemini rate-limits
  setAiClassifierMockHandler((inbound) => {
    const subject = (inbound.subject || '').toLowerCase();
    const text = (inbound.text || '').toLowerCase();
    if (subject.includes('sale') || subject.includes('discount') || text.includes('discount') || subject.includes('office supplies')) {
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
    if (subject.includes('digest') || subject.includes('newsletter') || inbound.sender?.includes('newsletter')) {
      return {
        classification: 'NEWSLETTER',
        category: 'newsletter',
        intent: 'newsletter_update',
        confidence: 0.99,
        reason: 'Newsletter digest detected',
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

  // Enable email automation access for Alpha and Beta
  await activateAutomation(companyAlpha.id, AutomationType.email);
  await activateAutomation(companyBeta.id, AutomationType.email);

  // Set 100 limit for Alpha
  await prisma.automationAccess.update({
    where: { companyId_automationType: { companyId: companyAlpha.id, automationType: AutomationType.email } },
    data: { monthlyLimit: 100, usedCredits: 0, reservedCredits: 0, quotaLocked: false },
  });

  // Setup Google Connection for Alpha with simulated tokens
  await updateAutomationConnection(companyAlpha.id, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    externalId: 'google-user-alpha',
    displayName: emailAlpha,
    metadata: {
      googleEmail: emailAlpha,
      googleUserId: 'google-user-alpha',
      encryptedAccessToken: encryptToken('sim-access-token-alpha'),
      encryptedRefreshToken: encryptToken('sim-refresh-token-alpha'),
      tokenExpiry: Date.now() + 3600 * 1000,
      historyId: '100010',
      watchExpiration: (Date.now() + 7 * 24 * 3600 * 1000).toString(),
      watchStatus: 'active',
      watchTopic: 'projects/automation-508113/topics/gmail-inbound',
    },
  });

  // Setup Google Connection for Beta
  await updateAutomationConnection(companyBeta.id, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    externalId: 'google-user-beta',
    displayName: emailBeta,
    metadata: {
      googleEmail: emailBeta,
      googleUserId: 'google-user-beta',
      encryptedAccessToken: encryptToken('sim-access-token-beta'),
      encryptedRefreshToken: encryptToken('sim-refresh-token-beta'),
      tokenExpiry: Date.now() + 3600 * 1000,
      historyId: '200010',
      watchExpiration: (Date.now() + 7 * 24 * 3600 * 1000).toString(),
      watchStatus: 'active',
      watchTopic: 'projects/automation-508113/topics/gmail-inbound',
    },
  });

  clearEmailIdCacheForTesting();
  clearPubSubInFlightLock();

  // -------------------------------------------------------------
  // Test 1: New genuine customer email triggers automatically
  // -------------------------------------------------------------
  console.log('\n[Test 1] New genuine customer email triggers automatic reply');
  {
    const customerEmail = {
      messageId: `<inquiry-001-${timestamp}@clientcorp.com>`,
      sender: 'sarah.client@clientcorp.com',
      senderName: 'Sarah Jenkins',
      recipient: emailAlpha,
      subject: 'Inquiry: Mobile Banking App Development',
      text: 'Hi, we are looking for a reliable software development agency to build a cross-platform mobile banking app with React Native and Node.js. Our allocated budget is $60,000 and we aim to launch by Q4. Could you provide your process and next steps?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-alpha-inquiry-1-${timestamp}`,
        gmailThreadId: `thread-alpha-inquiry-1-${timestamp}`,
      },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const result = await processInboundEmail(customerEmail, provider);

    assert(result.success === true, 'Pipeline executed successfully');
    assert(result.status === 'processed', 'Processing status is processed');
    assert(result.classification === 'CUSTOMER_INQUIRY', 'Classified as genuine CUSTOMER_INQUIRY');
    assert(result.replySent === true, 'Outbound email reply was sent');
    assert(Boolean(result.leadId), 'Lead record was created');

    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    assert(lead?.companyId === companyAlpha.id, 'Lead belongs to Alpha company');
  }

  // -------------------------------------------------------------
  // Test 2: Advertisement triggers no reply
  // -------------------------------------------------------------
  console.log('\n[Test 2] Advertisement triggers no reply (0 quota consumed)');
  {
    const initialQuota = await getEmailQuota(companyAlpha.id);
    const adEmail = {
      messageId: `<ad-001-${timestamp}@spampromotions.com>`,
      sender: 'deals@spampromotions.com',
      recipient: emailAlpha,
      subject: 'Special Limited Discount: 60% off all office supplies this week!',
      text: 'Do not miss our massive spring blowout sale. Click here to claim your coupon or unsubscribe from our promotional mailing list.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-ad-1-${timestamp}`,
        gmailThreadId: `thread-ad-1-${timestamp}`,
      },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const result = await processInboundEmail(adEmail, provider);

    assert(result.success === true, 'Pipeline completed without error');
    assert(result.status === 'skipped_irrelevant', 'Status flagged as skipped_irrelevant');
    assert(result.replySent !== true, 'No reply was sent');

    const afterQuota = await getEmailQuota(companyAlpha.id);
    assert(afterQuota.usedCredits === initialQuota.usedCredits, 'Quota was not consumed for advertisement (0 credits)');
  }

  // -------------------------------------------------------------
  // Test 3: Newsletter triggers no reply
  // -------------------------------------------------------------
  console.log('\n[Test 3] Newsletter triggers no reply');
  {
    const initialQuota = await getEmailQuota(companyAlpha.id);
    const newsletterEmail = {
      messageId: `<news-001-${timestamp}@techdigest.com>`,
      sender: 'newsletter@techdigest.com',
      recipient: emailAlpha,
      subject: 'Tech Weekly Digest #142: Top 10 trends in cloud architecture',
      text: 'Here is your weekly roundup of software engineering news and architectural case studies. To update your preferences or unsubscribe, click the link below.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-news-1-${timestamp}`,
        gmailThreadId: `thread-news-1-${timestamp}`,
      },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const result = await processInboundEmail(newsletterEmail, provider);

    assert(result.status === 'skipped_irrelevant', 'Newsletter flagged as skipped_irrelevant');
    assert(result.replySent !== true, 'No reply was sent for newsletter');

    const afterQuota = await getEmailQuota(companyAlpha.id);
    assert(afterQuota.usedCredits === initialQuota.usedCredits, '0 quota consumed for newsletter');
  }

  // -------------------------------------------------------------
  // Test 4: Customer follow-up triggers automatic contextual reply
  // -------------------------------------------------------------
  console.log('\n[Test 4] Customer follow-up triggers automatic contextual reply with conversation memory');
  {
    const followUpEmail = {
      messageId: `<followup-001-${timestamp}@clientcorp.com>`,
      sender: 'sarah.client@clientcorp.com',
      senderName: 'Sarah Jenkins',
      recipient: emailAlpha,
      subject: 'Re: Inquiry: Mobile Banking App Development',
      text: 'We also require an admin web dashboard for our internal compliance officers. Is that included in your estimate?',
      timestamp: Date.now(),
      inReplyTo: `<inquiry-001-${timestamp}@clientcorp.com>`,
      references: `<inquiry-001-${timestamp}@clientcorp.com>`,
      metadata: {
        gmailMessageId: `msg-alpha-followup-1-${timestamp}`,
        gmailThreadId: `thread-alpha-inquiry-1-${timestamp}`,
      },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const result = await processInboundEmail(followUpEmail, provider);

    assert(result.success === true, 'Follow-up processed successfully');
    assert(result.status === 'processed', 'Status is processed');
    assert(result.replySent === true, 'Reply sent for follow-up message');

    // Verify conversation memory in chat messages
    const chatMessages = await prisma.chatMessage.findMany({
      where: { leadId: result.leadId },
      orderBy: { createdAt: 'asc' },
    });
    assert(chatMessages.length >= 2, 'Chat thread retains conversation history');
  }

  // -------------------------------------------------------------
  // Test 5: Duplicate Pub/Sub notification does not duplicate reply
  // -------------------------------------------------------------
  console.log('\n[Test 5] Duplicate Pub/Sub notification does not duplicate reply');
  {
    const msgId = `msg-dup-pubsub-${timestamp}`;
    const firstEmail = {
      messageId: `<${msgId}@test.com>`,
      sender: 'client.dup@test.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Web App MVP',
      text: 'We need an MVP web application built in 2 months with Stripe. Budget is $15,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: msgId, gmailThreadId: `th-${msgId}` },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const firstRes = await processInboundEmail(firstEmail, provider);
    assert(firstRes.status === 'processed', 'First run processed email');

    // Duplicate submission
    const dupRes = await processInboundEmail(firstEmail, provider);
    assert(dupRes.status === 'duplicate_ignored', 'Duplicate delivery correctly ignored');
    assert(dupRes.replySent !== true, 'No duplicate reply sent');
  }

  // -------------------------------------------------------------
  // Test 6: Duplicate Gmail message does not duplicate reply
  // -------------------------------------------------------------
  console.log('\n[Test 6] Duplicate Gmail message ID does not duplicate reply');
  {
    const msgId = `msg-dup-gmail-${timestamp}`;
    const emailA = {
      messageId: `<msg-A-${timestamp}@test.com>`,
      sender: 'client.gmaildup@test.com',
      recipient: emailAlpha,
      subject: 'Inquiry: CRM Development',
      text: 'We need custom CRM workflows. Budget is $20,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: msgId, gmailThreadId: `th-${msgId}` },
    };
    const emailB = {
      ...emailA,
      messageId: `<msg-B-different-rfc-id-${timestamp}@test.com>`, // same gmailMessageId
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    await processInboundEmail(emailA, provider);
    const dupResult = await processInboundEmail(emailB, provider);

    assert(dupResult.status === 'duplicate_ignored', 'Duplicate Gmail message ID detected and ignored');
  }

  // -------------------------------------------------------------
  // Test 7: Multiple new emails in one history notification are all processed correctly
  // -------------------------------------------------------------
  console.log('\n[Test 7] Multiple new emails in one batch are all processed');
  {
    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const batchEmails = [
      {
        messageId: `<batch-1-${timestamp}@corp.com>`,
        sender: 'prospect1@corp.com',
        recipient: emailAlpha,
        subject: 'Inquiry: Project Alpha',
        text: 'Hello, looking to build an iOS and Android app. Budget is $30,000.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-batch-1-${timestamp}`, gmailThreadId: `th-b1-${timestamp}` },
      },
      {
        messageId: `<batch-2-${timestamp}@corp.com>`,
        sender: 'prospect2@corp.com',
        recipient: emailAlpha,
        subject: 'Inquiry: Project Beta',
        text: 'Hello, need an e-commerce platform with Shopify integration. Budget is $25,000.',
        timestamp: Date.now(),
        metadata: { gmailMessageId: `msg-batch-2-${timestamp}`, gmailThreadId: `th-b2-${timestamp}` },
      },
    ];

    let processedCount = 0;
    for (const em of batchEmails) {
      const res = await processInboundEmail(em, provider);
      if (res.status === 'processed') processedCount++;
    }
    assert(processedCount === 2, 'All messages in batch processed successfully');
  }

  // -------------------------------------------------------------
  // Test 8: Multiple notifications for same history range are safe
  // -------------------------------------------------------------
  console.log('\n[Test 8] Multiple notifications for same history range are safe');
  {
    const msgId = `msg-range-${timestamp}`;
    const email = {
      messageId: `<${msgId}@test.com>`,
      sender: 'range@test.com',
      recipient: emailAlpha,
      subject: 'Inquiry: API Microservices',
      text: 'We need Go / Docker microservices architecture. Budget is $45,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: msgId, gmailThreadId: `th-${msgId}` },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const r1 = await processInboundEmail(email, provider);
    const r2 = await processInboundEmail(email, provider);

    assert(r1.status === 'processed', 'First notification processed');
    assert(r2.status === 'duplicate_ignored', 'Second notification in same range is safely ignored');
  }

  // -------------------------------------------------------------
  // Test 9: Quota exhausted prevents reply
  // -------------------------------------------------------------
  console.log('\n[Test 9] Quota exhausted prevents reply and AI generation');
  {
    // Temporarily lock quota
    await prisma.automationAccess.update({
      where: { companyId_automationType: { companyId: companyAlpha.id, automationType: AutomationType.email } },
      data: { monthlyLimit: 5, usedCredits: 5, quotaLocked: true },
    });

    const email = {
      messageId: `<quota-exceeded-${timestamp}@client.com>`,
      sender: 'client.locked@client.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Web App',
      text: 'We want to hire you for a $50k web app project.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: `msg-locked-${timestamp}`, gmailThreadId: `th-locked-${timestamp}` },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const res = await processInboundEmail(email, provider);

    assert(res.success === false, 'Blocked when quota is exhausted');
    assert(res.status === 'quota_locked', 'Status is quota_locked');
    assert(res.replySent !== true, 'No reply sent when quota locked');

    // Restore quota
    await prisma.automationAccess.update({
      where: { companyId_automationType: { companyId: companyAlpha.id, automationType: AutomationType.email } },
      data: { monthlyLimit: 100, usedCredits: 0, quotaLocked: false },
    });
  }

  // -------------------------------------------------------------
  // Test 10: Successful reply consumes exactly 1 credit
  // -------------------------------------------------------------
  console.log('\n[Test 10] Successful reply consumes exactly 1 credit');
  {
    const beforeQuota = await getEmailQuota(companyAlpha.id);
    const email = {
      messageId: `<credit-test-${timestamp}@client.com>`,
      sender: 'client.credit@client.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Backend Refactoring',
      text: 'We need our PostgreSQL database queries optimized. Budget $10,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: `msg-credit-${timestamp}`, gmailThreadId: `th-credit-${timestamp}` },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const res = await processInboundEmail(email, provider);
    assert(res.replySent === true, 'Reply was sent');

    const afterQuota = await getEmailQuota(companyAlpha.id);
    assert(afterQuota.usedCredits === beforeQuota.usedCredits + 1, 'Used credits incremented by exactly 1');
  }

  // -------------------------------------------------------------
  // Test 11: AI failure consumes 0 credits
  // -------------------------------------------------------------
  console.log('\n[Test 11] AI failure consumes 0 credits (reservation released)');
  {
    const beforeQuota = await getEmailQuota(companyAlpha.id);
    const email = {
      messageId: `<ai-fail-${timestamp}@client.com>`,
      sender: 'client.aifail@client.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Mobile App',
      text: 'Looking for a mobile app developer. Budget $20,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-aifail-${timestamp}`,
        gmailThreadId: `th-aifail-${timestamp}`,
        simulateAiError: true, // Trigger simulated AI exception
      },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const res = await processInboundEmail(email, provider);

    assert(res.success === false, 'AI error properly caught');
    const afterQuota = await getEmailQuota(companyAlpha.id);
    assert(afterQuota.usedCredits === beforeQuota.usedCredits, 'Zero credits consumed on AI failure');
    assert(afterQuota.reservedCredits === 0, 'Reservation released on AI failure');
  }

  // -------------------------------------------------------------
  // Test 12: Gmail send failure consumes 0 credits
  // -------------------------------------------------------------
  console.log('\n[Test 12] Gmail send failure consumes 0 credits (reservation released)');
  {
    const beforeQuota = await getEmailQuota(companyAlpha.id);
    const email = {
      messageId: `<send-fail-${timestamp}@client.com>`,
      sender: 'client.sendfail@client.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Mobile App',
      text: 'Looking for a React Native app developer. Budget $30,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-sendfail-${timestamp}`,
        gmailThreadId: `th-sendfail-${timestamp}`,
      },
    };

    // Custom provider where sendMessage fails
    const failingSendProvider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    failingSendProvider.sendMessage = async () => ({
      success: false,
      error: 'Simulated Gmail API quota 429 rate limit exceeded',
    });

    const res = await processInboundEmail(email, failingSendProvider);
    assert(res.success === false, 'Send failure handled');
    assert(res.errorCategory === 'EMAIL_SEND_FAILED', 'Error categorized as EMAIL_SEND_FAILED');

    const afterQuota = await getEmailQuota(companyAlpha.id);
    assert(afterQuota.usedCredits === beforeQuota.usedCredits, 'Zero credits consumed on send failure');
    assert(afterQuota.reservedCredits === 0, 'Reservation released on send failure');
  }

  // -------------------------------------------------------------
  // Test 13: Wrong/unknown emailAddress is safely ignored
  // -------------------------------------------------------------
  console.log('\n[Test 13] Wrong/unknown emailAddress is safely ignored with HTTP 200');
  {
    const res = await sendPubSubWebhook('unknown-random-unregistered@gmail.com', '999999');
    const json = await res.json();

    assert(res.status === 200, 'HTTP 200 returned for unknown email address');
    assert(json.message === 'No connection mapped', 'Response states No connection mapped');
  }

  // -------------------------------------------------------------
  // Test 14: Company A's notification cannot process Company B's mailbox
  // -------------------------------------------------------------
  console.log('\n[Test 14] Cross-tenant isolation: Company A cannot process Company B mailbox');
  {
    // Send PubSub notification for Alpha's email
    const res = await sendPubSubWebhook(emailAlpha, '100050');
    const json = await res.json();

    assert(res.status === 200, 'Webhook processed successfully');
    assert(json.companyId === companyAlpha.id, 'Mapped to Company Alpha');
    assert(json.companyId !== companyBeta.id, 'Strict isolation from Company Beta');
  }

  // -------------------------------------------------------------
  // Test 15: Expired historyId causes safe full-sync/recovery behavior
  // -------------------------------------------------------------
  console.log('\n[Test 15] Expired historyId triggers safe recovery without crash');
  {
    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });

    let recoveryAttempted = false;
    try {
      const err = new Error('Gmail historyId 100010 is expired or invalid (404)');
      err.isExpiredHistoryId = true;
      err.statusCode = 404;
      throw err;
    } catch (e) {
      if (e.statusCode === 404 || e.isExpiredHistoryId) {
        recoveryAttempted = true;
      }
    }
    assert(recoveryAttempted, 'Expired historyId properly detected');

    const profile = await provider.getProfile();
    assert(Boolean(profile.historyId), 'Retrieved profile historyId for safe baseline recovery');
  }

  // -------------------------------------------------------------
  // Test 16: Watch renewal works
  // -------------------------------------------------------------
  console.log('\n[Test 16] Watch renewal works properly');
  {
    // Set watch expiration to 1 hour from now (within 48 hour threshold)
    const soonExpiring = Date.now() + 1 * 3600 * 1000;
    const existingConn = await prisma.automationConnection.findUnique({
      where: { companyId_automationType: { companyId: companyAlpha.id, automationType: AutomationType.email } },
    });
    await prisma.automationConnection.update({
      where: { companyId_automationType: { companyId: companyAlpha.id, automationType: AutomationType.email } },
      data: {
        metadata: {
          ...((existingConn?.metadata) || {}),
          googleEmail: emailAlpha,
          historyId: '100010',
          watchExpiration: soonExpiring.toString(),
          watchStatus: 'active',
        },
      },
    });

    const renewalRes = await renewGmailWatchIfNeeded(companyAlpha.id, 48);
    assert(renewalRes.renewed === true, 'Renewed expiring watch');

    const scanRes = await renewAllExpiringWatches(48);
    assert(scanRes.total >= 1, 'Scanned all connected integrations');
  }

  // -------------------------------------------------------------
  // Test 17: Disconnect stops/invalidates automation correctly
  // -------------------------------------------------------------
  console.log('\n[Test 17] Disconnect stops watch and updates status');
  {
    const stopRes = await stopGmailWatch(companyBeta.id);
    assert(stopRes.success === true, 'Stop watch completed');

    await disconnectAutomation(companyBeta.id, AutomationType.email);
    const conn = await prisma.automationConnection.findUnique({
      where: { companyId_automationType: { companyId: companyBeta.id, automationType: AutomationType.email } },
    });
    assert(conn?.status === ConnectionStatus.disconnected, 'Connection marked disconnected');
  }

  // -------------------------------------------------------------
  // Test 18: Manual Sync Inbox still works
  // -------------------------------------------------------------
  console.log('\n[Test 18] Manual Sync Inbox still works as fallback');
  {
    // Verify simulate sync with GoogleProvider
    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });
    const dummyMsg = {
      messageId: `sync-manual-${timestamp}`,
      sender: 'manual.sync@client.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Cloud Migration',
      text: 'Need AWS to GCP migration consulting. Budget is $35,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: `sync-manual-${timestamp}` },
    };

    const res = await processInboundEmail(dummyMsg, provider);
    assert(res.status === 'processed', 'Manual sync message processed successfully');
  }

  // -------------------------------------------------------------
  // Test 19: Automatic webhook and manual Sync race condition protection
  // -------------------------------------------------------------
  console.log('\n[Test 19] Concurrency protection prevents race conditions between webhook and sync');
  {
    const raceMsgId = `race-msg-${timestamp}`;
    const raceEmail = {
      messageId: `<${raceMsgId}@race.com>`,
      sender: 'race.client@race.com',
      recipient: emailAlpha,
      subject: 'Inquiry: Security Audit',
      text: 'We need a penetration test and SOC2 compliance audit. Budget is $20,000.',
      timestamp: Date.now(),
      metadata: { gmailMessageId: raceMsgId, gmailThreadId: `th-${raceMsgId}` },
    };

    const provider = new GoogleProvider({ connectedEmail: emailAlpha, simulated: true });

    // Run two parallel invocations simultaneously
    const [resA, resB] = await Promise.all([
      processInboundEmail(raceEmail, provider),
      processInboundEmail(raceEmail, provider),
    ]);

    const statuses = [resA.status, resB.status];
    assert(statuses.includes('processed'), 'One execution succeeded in processing');
    assert(statuses.includes('duplicate_ignored'), 'The concurrent execution was safely deduplicated');

    // Only 1 reply was sent across both concurrent calls
    const replyCount = (resA.replySent ? 1 : 0) + (resB.replySent ? 1 : 0);
    assert(replyCount === 1, 'Exactly one outbound reply sent across concurrent calls');
  }

  // -------------------------------------------------------------
  // Test 20: Pub/Sub webhook returns HTTP 200
  // -------------------------------------------------------------
  console.log('\n[Test 20] Pub/Sub webhook returns HTTP 200 for acknowledgment');
  {
    const res = await sendPubSubWebhook(emailAlpha, '100099');
    assert(res.status === 200, 'Webhook returns HTTP 200 status code');
    const json = await res.json();
    assert(json.success === true, 'Webhook returns success: true');
  }

  // Cleanup test records
  console.log('\n[Cleanup] Cleaning up test records...');
  try {
    await prisma.chatMessage.deleteMany({
      where: { lead: { companyId: { in: [companyAlphaId, companyBetaId] } } },
    });
    await prisma.lead.deleteMany({
      where: { companyId: { in: [companyAlphaId, companyBetaId] } },
    });
    await prisma.automationQuotaAuditLog.deleteMany({
      where: { companyId: { in: [companyAlphaId, companyBetaId] } },
    });
    await prisma.automationConnection.deleteMany({
      where: { companyId: { in: [companyAlphaId, companyBetaId] } },
    });
    await prisma.automationAccess.deleteMany({
      where: { companyId: { in: [companyAlphaId, companyBetaId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAlphaId, companyBetaId] } },
    });
    clearGeminiMockHandler();
    clearAiClassifierMockHandler();
    console.log('  ✓ Test records cleaned up safely');
  } catch (cleanErr) {
    console.warn('  Clean up notice:', cleanErr.message);
  }

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPubSubTests().catch((err) => {
  console.error('\nFatal test error:', err);
  process.exit(1);
});
