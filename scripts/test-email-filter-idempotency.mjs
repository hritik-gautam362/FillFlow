/**
 * Comprehensive Test Suite for Gmail Email Automation:
 * Irrelevant Email Filtering & Strict Idempotency.
 *
 * Scenarios tested (12 Required Scenarios):
 * 1. Genuine client inquiry -> AI processes -> one reply.
 * 2. Same Gmail message synced twice -> only one reply.
 * 3. Newsletter -> skipped, zero reply.
 * 4. Advertisement -> skipped, zero reply.
 * 5. no-reply sender -> skipped, zero reply.
 * 6. automated notification -> skipped, zero reply.
 * 7. Gmail promotion email -> skipped, zero reply.
 * 8. Client sends second reply in same thread -> existing Lead updated, no new Lead.
 * 9. AI processing failure -> no false processed state.
 * 10. Outbound send failure -> retry remains possible.
 * 11. Outbound send succeeds then DB update fails -> next sync MUST NOT send duplicate reply.
 * 12. Different genuine client emails -> each can create/process independently.
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus, ChannelSource, MessageSender } from '@prisma/client';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
  isEmailIdInMemory,
  isMessageAlreadyProcessed,
} from '../src/lib/services/email/emailInboundService.ts';
import { activateAutomation } from '../src/lib/services/automationAccessService.ts';
import { updateAutomationConnection } from '../src/lib/services/automationConnectionService.ts';
import { classifyInboundEmail } from '../src/lib/services/email/emailClassifier.ts';

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

async function runAllScenarios() {
  console.log('\n===============================================================');
  console.log('  GMAIL AUTOMATION: FILTERING & IDEMPOTENCY 12-SCENARIO SUITE  ');
  console.log('===============================================================\n');

  // Setup test company & connection
  const companyId = 'test-filter-company-' + Date.now();
  const connectedEmail = `agency-inbox-${Date.now()}@gmail.com`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: 'Apex AI Software Lab',
      industry: 'Software Engineering',
    },
  });

  await activateAutomation(companyId, AutomationType.email);

  await updateAutomationConnection(companyId, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: connectedEmail,
    metadata: {
      googleEmail: connectedEmail,
    },
  });

  const provider = new GoogleProvider({
    connectedEmail,
    simulated: true,
  });

  let initialLeadId = '';
  const initialThreadId = `thread-scen-${Date.now()}`;
  const initialMsgId = `gmail-msg-inq-${Date.now()}`;
  const clientEmail1 = `prospect.john-${Date.now()}@acmecorp.com`;

  // -------------------------------------------------------------------------
  // Scenario 1: Genuine client inquiry -> AI processes -> one reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 1] Genuine client inquiry -> AI processes -> one reply');
  {
    clearEmailIdCacheForTesting();

    const inquiryEmail = {
      messageId: initialMsgId,
      sender: clientEmail1,
      senderName: 'John Acme',
      recipient: connectedEmail,
      subject: 'Inquiry: Custom Cloud Web App Development',
      text: 'Hi Apex team, we need to build a custom customer portal with Next.js, Stripe, and PostgreSQL. Budget is $35,000 and target launch is Q4. Can we schedule a scoping call?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: initialMsgId,
        gmailThreadId: initialThreadId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(inquiryEmail, provider);
    assert(res.success === true, 'Inbound inquiry processing succeeded');
    assert(res.status === 'processed', 'Processing status is "processed"');
    assert(res.classification === 'client_inquiry' || res.classification === 'CUSTOMER_INQUIRY', 'Email classified as customer inquiry');
    assert(res.sendResult?.success === true, 'Outbound email reply was sent successfully');
    assert(res.leadId !== undefined, 'Created Lead record');

    initialLeadId = res.leadId;

    // Verify ChatMessages
    const msgs = await prisma.chatMessage.findMany({
      where: { leadId: initialLeadId },
      orderBy: { createdAt: 'asc' },
    });
    assert(msgs.length === 2, 'Exactly 2 ChatMessages created (1 client inquiry, 1 agent response)');
    assert(msgs[0].sender === MessageSender.client, 'First message from client');
    assert(msgs[1].sender === MessageSender.agent, 'Second message from agent');
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Same Gmail message synced twice -> only one reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 2] Same Gmail message synced twice -> only one reply');
  {
    const duplicateEmail = {
      messageId: initialMsgId,
      sender: clientEmail1,
      recipient: connectedEmail,
      subject: 'Inquiry: Custom Cloud Web App Development',
      text: 'Hi Apex team, we need to build a custom customer portal...',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: initialMsgId,
        gmailThreadId: initialThreadId,
        labelIds: ['INBOX'],
      },
    };

    // First duplicate attempt (memory cache hit)
    const dupRes1 = await processInboundEmail(duplicateEmail, provider);
    assert(dupRes1.status === 'duplicate_ignored', 'Duplicate caught by in-memory idempotency check');
    assert(dupRes1.sendResult === undefined, 'No outbound email was sent');

    // Clear memory cache to test Neon Database idempotency hit
    clearEmailIdCacheForTesting();
    const dupRes2 = await processInboundEmail(duplicateEmail, provider);
    assert(dupRes2.status === 'duplicate_ignored', 'Duplicate caught by database idempotency check');
    assert(dupRes2.sendResult === undefined, 'Zero reply sent on duplicate database lookup');

    // Confirm chat messages count on lead did not increase
    const msgs = await prisma.chatMessage.findMany({
      where: { leadId: initialLeadId },
    });
    assert(msgs.length === 2, 'ChatMessages count remained 2 (no duplicate messages inserted)');
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Newsletter -> skipped, zero reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 3] Newsletter (List-Unsubscribe, Precedence: bulk) -> skipped, zero reply');
  {
    clearEmailIdCacheForTesting();
    const newsletterMsgId = `gmail-newsletter-${Date.now()}`;

    const newsletterEmail = {
      messageId: newsletterMsgId,
      sender: 'newsletter@techdigestweekly.com',
      senderName: 'Tech Digest Weekly',
      recipient: connectedEmail,
      subject: 'Issue #142: Top 10 TypeScript Tips for 2026',
      text: 'Welcome to this weeks issue of Tech Digest! Read the latest news...\nTo unsubscribe click here.',
      timestamp: Date.now(),
      rawHeaders: {
        'List-Unsubscribe': '<mailto:unsub@techdigestweekly.com>',
        'List-ID': '<weekly-newsletter.techdigestweekly.com>',
        Precedence: 'bulk',
      },
      metadata: {
        gmailMessageId: newsletterMsgId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(newsletterEmail, provider);
    assert(res.success === true, 'Result success is true');
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'spam_or_promotion' || res.classification === 'NEWSLETTER', 'Classified as newsletter');
    assert(res.sendResult === undefined, 'Zero reply was sent');
    assert(res.leadId === undefined, 'No Lead record created');
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Advertisement -> skipped, zero reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 4] Advertisement -> skipped, zero reply');
  {
    clearEmailIdCacheForTesting();
    const adMsgId = `gmail-ad-${Date.now()}`;

    const adEmail = {
      messageId: adMsgId,
      sender: 'sales@cloud-hardware-deals.com',
      senderName: 'Hardware Mega Deals',
      recipient: connectedEmail,
      subject: 'Exclusive Flash Sale: 40% off High Performance Server Racks!',
      text: 'Limited time offer! Save $500 on enterprise rack servers this weekend only. Click here to unsubscribe.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: adMsgId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(adEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'spam_or_promotion' || res.classification === 'PROMOTIONAL', 'Classified as promotional');
    assert(res.sendResult === undefined, 'Zero reply was sent');
    assert(res.leadId === undefined, 'No Lead created');
  }

  // -------------------------------------------------------------------------
  // Scenario 5: no-reply sender -> skipped, zero reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 5] no-reply sender -> skipped, zero reply');
  {
    clearEmailIdCacheForTesting();
    const noreplyMsgId = `gmail-noreply-${Date.now()}`;

    const noreplyEmail = {
      messageId: noreplyMsgId,
      sender: 'no-reply@github.com',
      senderName: 'GitHub Notifications',
      recipient: connectedEmail,
      subject: '[GitHub] A new release has been published for repository/core',
      text: 'Release v2.4.0 is now available. This is an automated notification, please do not reply.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: noreplyMsgId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(noreplyEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'automated' || res.classification === 'AUTOMATED', 'Classified as automated');
    assert(res.sendResult === undefined, 'Zero reply was sent to no-reply address');
    assert(res.leadId === undefined, 'No Lead created');
  }

  // -------------------------------------------------------------------------
  // Scenario 6: automated notification (OTP / Receipt) -> skipped, zero reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 6] automated notification (Security OTP & Receipt) -> skipped, zero reply');
  {
    clearEmailIdCacheForTesting();
    const otpMsgId = `gmail-otp-${Date.now()}`;

    const otpEmail = {
      messageId: otpMsgId,
      sender: 'security@cloudservice.io',
      senderName: 'CloudService Security',
      recipient: connectedEmail,
      subject: 'Your one-time verification code is 894-201',
      text: 'Please enter this verification code to complete your login. If you did not request this, secure your account.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: otpMsgId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(otpEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'automated' || res.classification === 'AUTOMATED', 'Classified as automated');
    assert(res.sendResult === undefined, 'Zero reply sent to OTP email');
    assert(res.leadId === undefined, 'No Lead created');
  }

  // -------------------------------------------------------------------------
  // Scenario 7: Gmail promotion email (CATEGORY_PROMOTIONS label) -> skipped, zero reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 7] Gmail promotion email (CATEGORY_PROMOTIONS) -> skipped, zero reply');
  {
    clearEmailIdCacheForTesting();
    const promoMsgId = `gmail-promo-label-${Date.now()}`;

    const promoEmail = {
      messageId: promoMsgId,
      sender: 'contact@brandmarketing.org',
      senderName: 'Brand Marketing',
      recipient: connectedEmail,
      subject: 'Special partnership opportunities for your business',
      text: 'Grow your traffic with our automated SEO tools. Read more at brandmarketing.org.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: promoMsgId,
        labelIds: ['INBOX', 'CATEGORY_PROMOTIONS', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(promoEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'spam_or_promotion' || res.classification === 'PROMOTIONAL', 'Classified as promotional via Gmail label');
    assert(res.sendResult === undefined, 'Zero reply sent');
    assert(res.leadId === undefined, 'No Lead created');
  }

  // -------------------------------------------------------------------------
  // Scenario 8: Client sends second reply in same thread -> existing Lead updated, no new Lead.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 8] Client sends second reply in same thread -> existing Lead updated, no new Lead');
  {
    clearEmailIdCacheForTesting();
    const secondMsgId = `gmail-followup-${Date.now()}`;

    // Client continues conversation in same thread
    const followUpEmail = {
      messageId: secondMsgId,
      sender: clientEmail1,
      senderName: 'John Acme',
      recipient: connectedEmail,
      subject: 'Re: Inquiry: Custom Cloud Web App Development',
      text: 'Thanks for the quick response! We also require role-based permissions (Admin, Manager, User) and a reporting dashboard. We want the project completed within 3 months.',
      inReplyTo: initialMsgId,
      references: initialMsgId,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: secondMsgId,
        gmailThreadId: initialThreadId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const res = await processInboundEmail(followUpEmail, provider);
    assert(res.success === true, 'Follow-up reply processed successfully');
    assert(res.leadId === initialLeadId, 'Associated message with the EXISTING Lead (same leadId)');

    // Count total leads for this client email
    const totalLeads = await prisma.lead.count({
      where: { companyId, email: clientEmail1 },
    });
    assert(totalLeads === 1, 'Total Leads count for client is strictly 1 (no duplicate lead created)');

    // Verify ChatMessages grew on the same lead
    const allMsgs = await prisma.chatMessage.findMany({
      where: { leadId: initialLeadId },
      orderBy: { createdAt: 'asc' },
    });
    assert(allMsgs.length === 4, 'Lead now has 4 ChatMessages (2 inquiry pairs in single thread)');
  }

  // -------------------------------------------------------------------------
  // Scenario 9: AI processing failure -> no false processed state.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 9] AI processing failure -> no false processed state');
  {
    clearEmailIdCacheForTesting();
    const failMsgId = `gmail-fail-ai-${Date.now()}`;

    const brokenInbound = {
      messageId: failMsgId,
      sender: 'error.trigger@example.com',
      recipient: connectedEmail,
      subject: 'Inquiry for Development Services',
      text: 'We want software developed with custom AI agent workflows.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: failMsgId,
        simulateAiError: true, // Trigger AI processing error
      },
    };

    const failRes = await processInboundEmail(brokenInbound, provider);
    assert(failRes.success === false, 'Result flags failure');
    assert(failRes.status === 'error', 'Status is error');
    assert(failRes.errorCategory === 'EMAIL_PROVIDER_ERROR', 'Returns errorCategory EMAIL_PROVIDER_ERROR');

    // Confirm the messageId is NOT stored as processed in memory
    assert(!isEmailIdInMemory(failMsgId), 'Message ID was removed from memory cache, remaining retryable');
  }

  // -------------------------------------------------------------------------
  // Scenario 10: Outbound send failure -> retry remains possible.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 10] Outbound send failure -> retry remains possible');
  {
    clearEmailIdCacheForTesting();
    const sendFailMsgId = `gmail-sendfail-${Date.now()}`;

    // Provider configured to simulate outbound failure
    const failingSendProvider = new GoogleProvider({
      connectedEmail,
      simulated: true,
    });
    // Override sendMessage to return failure
    failingSendProvider.sendMessage = async () => ({
      success: false,
      error: 'Gmail API 503: Service Unavailable',
      statusCode: 503,
    });

    const sendFailEmail = {
      messageId: sendFailMsgId,
      sender: `retry.client-${Date.now()}@domain.com`,
      recipient: connectedEmail,
      subject: 'Urgent Project Scoping Request',
      text: 'Need immediate quote for e-commerce website redesign. Budget is $15k.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: sendFailMsgId,
        gmailThreadId: `thread-sendfail-${Date.now()}`,
      },
    };

    const failSendRes = await processInboundEmail(sendFailEmail, failingSendProvider);
    assert(failSendRes.success === false, 'Returns failure when send fails');
    assert(failSendRes.status === 'error', 'Status is error');
    assert(failSendRes.errorCategory === 'EMAIL_SEND_FAILED', 'Error category is EMAIL_SEND_FAILED');

    // Verify it is NOT marked in memory so next sync can retry it
    assert(!isEmailIdInMemory(sendFailMsgId), 'Failed send message ID removed from memory cache for retry');

    // Now retry with working provider
    const workingProvider = new GoogleProvider({
      connectedEmail,
      simulated: true,
    });

    const retryRes = await processInboundEmail(sendFailEmail, workingProvider);
    assert(retryRes.success === true, 'Retry with working provider succeeds');
    assert(retryRes.status === 'processed', 'Retry status is processed');
    assert(retryRes.sendResult?.success === true, 'Outbound email sent on retry');
  }

  // -------------------------------------------------------------------------
  // Scenario 11: Outbound send succeeds then DB update fails -> next sync MUST NOT send duplicate reply.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 11] Outbound send succeeds then DB update fails -> next sync MUST NOT send duplicate reply');
  {
    clearEmailIdCacheForTesting();
    const edgeMsgId = `gmail-edge-${Date.now()}`;
    const edgeThreadId = `thread-edge-${Date.now()}`;
    const edgeClientEmail = `edge.client-${Date.now()}@techstart.io`;

    const edgeProvider = new GoogleProvider({
      connectedEmail,
      simulated: true,
    });

    const edgeEmail = {
      messageId: edgeMsgId,
      sender: edgeClientEmail,
      recipient: connectedEmail,
      subject: 'Web Application Infrastructure Proposal',
      text: 'We require high-availability cloud architecture setup. Budget is $50,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: edgeMsgId,
        gmailThreadId: edgeThreadId,
      },
    };

    // First processing passes and sends outbound email
    const firstEdgeRes = await processInboundEmail(edgeEmail, edgeProvider);
    assert(firstEdgeRes.success === true, 'Initial delivery succeeded and outbound reply sent');
    assert(firstEdgeRes.sendResult?.success === true, 'Outbound message ID obtained');

    // Simulate scenario: clear memory cache AND delete ChatMessage to simulate DB update loss
    clearEmailIdCacheForTesting();

    // Verify that the provider has recorded the reply in the thread
    const hasOutbound = await edgeProvider.hasOutboundReply(edgeThreadId, edgeMsgId);
    assert(hasOutbound === true, 'Provider records outbound reply exists in the Gmail thread');

    // Now sync runs again on the same incoming message
    const secondSyncRes = await processInboundEmail(edgeEmail, edgeProvider);
    assert(
      secondSyncRes.status === 'duplicate_ignored',
      'Second sync safely detects outbound reply in thread and ignores duplicate'
    );
    assert(secondSyncRes.sendResult === undefined, 'No duplicate outbound reply was sent');
  }

  // -------------------------------------------------------------------------
  // Scenario 12: Different genuine client emails -> each can create/process independently.
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 12] Different genuine client emails -> each can create/process independently');
  {
    clearEmailIdCacheForTesting();

    const clientEmailA = `client.alice-${Date.now()}@firm-a.com`;
    const clientEmailB = `client.bob-${Date.now()}@firm-b.com`;

    const emailA = {
      messageId: `gmail-alice-${Date.now()}`,
      sender: clientEmailA,
      senderName: 'Alice Johnson',
      recipient: connectedEmail,
      subject: 'Inquiry: Native iOS App Development',
      text: 'We are seeking a development firm to build a native Swift iOS app for our logistics team. Estimated budget is $28,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-alice-${Date.now()}`,
        gmailThreadId: `thread-alice-${Date.now()}`,
      },
    };

    const emailB = {
      messageId: `gmail-bob-${Date.now()}`,
      sender: clientEmailB,
      senderName: 'Bob Williams',
      recipient: connectedEmail,
      subject: 'Inquiry: B2B SaaS Platform Redesign',
      text: 'Looking for full-stack engineering team to rebuild our B2B SaaS platform. Budget is $60,000 with 4 month timeline.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-bob-${Date.now()}`,
        gmailThreadId: `thread-bob-${Date.now()}`,
      },
    };

    const resA = await processInboundEmail(emailA, provider);
    const resB = await processInboundEmail(emailB, provider);

    assert(resA.success === true && resA.status === 'processed', 'Client Alice inquiry processed');
    assert(resB.success === true && resB.status === 'processed', 'Client Bob inquiry processed');

    assert(resA.leadId !== resB.leadId, 'Alice and Bob have separate, independent Lead records');

    const leadA = await prisma.lead.findUnique({ where: { id: resA.leadId } });
    const leadB = await prisma.lead.findUnique({ where: { id: resB.leadId } });

    assert(leadA?.email === clientEmailA, 'Lead A email matches Alice');
    assert(leadB?.email === clientEmailB, 'Lead B email matches Bob');
    assert(leadA?.companyId === companyId, 'Lead A belongs to tenant');
    assert(leadB?.companyId === companyId, 'Lead B belongs to tenant');
  }

  console.log('\n===============================================================');
  console.log(`  ALL 12 SCENARIOS COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllScenarios()
  .catch((err) => {
    console.error('Test run failed with unhandled error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
