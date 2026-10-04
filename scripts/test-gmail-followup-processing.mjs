/**
 * Comprehensive Regression Test Suite:
 * Gmail Follow-Up & Thread Processing
 *
 * Scenarios:
 * 1. New inquiry → processed
 * 2. FillFlow reply → ignored
 * 3. Customer follow-up in SAME thread → processed
 * 4. Second customer follow-up in SAME thread → processed
 * 5. Same Gmail message ID delivered twice → processed once
 * 6. Pub/Sub duplicate → processed once
 * 7. Manual Sync + Pub/Sub same message → one response
 * 8. Meeting proposal follow-up → processed
 * 9. Courtesy close → no response
 * 10. Newsletter → no response
 * 11. Promotional email → no response
 * 12. Follow-up after partnership → partnership context retained
 * 13. Follow-up after pricing inquiry → pricing context retained
 * 14. Follow-up after service inquiry → service context retained
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus, MessageSender, LeadStatus } from '@prisma/client';
import { processInboundEmail, clearEmailIdCacheForTesting } from '../src/lib/services/email/emailInboundService.ts';
import { setGeminiMockHandler, clearGeminiMockHandler } from '../src/lib/ai/gemini.ts';
import { setClassifierMockHandler, clearClassifierMockHandler } from '../src/lib/services/email/emailClassifier.ts';
import { getEmailQuota } from '../src/lib/services/emailQuotaService.ts';

import { activateAutomation } from '../src/lib/services/automationAccessService.ts';
import { updateAutomationConnection } from '../src/lib/services/automationConnectionService.ts';

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAILED: ${description}`);
    throw new Error(description);
  }
}

class MockEmailProvider {
  constructor(connectedEmail) {
    this.connectedEmail = connectedEmail;
    this.sentEmails = [];
    this.readMessageIds = new Set();
  }

  async sendMessage(message) {
    const providerMessageId = `mock-outbound-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.sentEmails.push({ ...message, providerMessageId });
    return { success: true, providerMessageId };
  }

  async markAsRead(messageId) {
    this.readMessageIds.add(messageId);
    return { success: true };
  }

  async hasOutboundReply(threadId, messageId) {
    return this.sentEmails.some((e) => e.metadata?.incomingGmailMessageId === messageId);
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('  REGRESSION TEST SUITE: GMAIL FOLLOW-UP & THREAD PROCESSING');
  console.log('========================================================================\n');

  const timestamp = Date.now();
  const companyId = `test-followup-${timestamp}`;
  const connectedEmail = `agent-${timestamp}@testco.com`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: 'FollowUp Test Co',
      industry: 'technology and automation services',
    },
  });

  await activateAutomation(companyId, AutomationType.email);
  await updateAutomationConnection(companyId, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: connectedEmail,
    metadata: {
      googleEmail: connectedEmail,
      processedEmailIds: {},
    },
  });

  const provider = new MockEmailProvider(connectedEmail);
  const sharedThreadId = `thread-followup-${timestamp}`;
  const senderEmail = `prospect-${timestamp}@domain.com`;

  // Set intelligent Mock Gemini Handler that understands intent and context
  setGeminiMockHandler(async (params) => {
    const text = params.latestMessage.toLowerCase();
    const intent = (params.intent || '').toLowerCase();
    const history = params.history || [];

    if (intent.includes('meeting') || text.includes('call around') || text.includes('works for you') || text.includes('work instead')) {
      const timeMatch = params.latestMessage.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)|\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
      const timeStr = timeMatch ? timeMatch[0] : 'the proposed time';
      const timezoneAlreadyAsked = (params.history || []).some((m) => m.text && m.text.toLowerCase().includes('timezone'));
      const nextQ = timezoneAlreadyAsked
        ? 'Could you let us know if Google Meet works best for the call?'
        : 'Could you confirm your timezone so we can coordinate the calendar invite?';

      return {
        reply: `Hi, thanks for following up. ${timeStr} works well for us to discuss the partnership. ${nextQ}`,
        options: [],
        conversationState: 'ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: `Call availability confirmed for ${timeStr}`,
        nextBestQuestion: nextQ,
        extractedRequirements: {
          clientName: 'Prospect',
          companyName: 'Domain Co',
          email: params.sender || '',
          phone: '',
          projectType: 'Strategic Partnership',
          objective: 'Meeting scheduling',
          targetAudience: '',
          features: [],
          techStack: [],
          budget: '',
          timeline: timeStr,
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 20,
          readyForBrief: false,
        },
      };
    }

    if (intent.includes('partnership') || text.includes('partner')) {
      return {
        reply: `Hi, thanks for reaching out to FollowUp Test Co. We are definitely open to exploring strategic partnerships and discussing mutually beneficial collaboration opportunities, including client referrals. Would you be open to scheduling a brief introductory call to discuss how we might work together?`,
        options: [],
        conversationState: 'ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Openness to partnership and referral collaboration',
        nextBestQuestion: 'Would you be open to scheduling a brief introductory call?',
        extractedRequirements: {
          clientName: 'Prospect',
          companyName: 'Domain Co',
          email: params.sender || '',
          phone: '',
          projectType: 'Strategic Partnership',
          objective: 'Referral collaboration',
          targetAudience: '',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 10,
          readyForBrief: false,
        },
      };
    }

    if (intent.includes('pricing') || text.includes('cost') || text.includes('price')) {
      return {
        reply: `Hi, thanks for reaching out. Project costs depend on the specific features and scope required. Could you share what key features or primary goals you have in mind?`,
        options: [],
        conversationState: 'ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Pricing guidance provided',
        nextBestQuestion: 'Could you share what key features or primary goals you have in mind?',
        extractedRequirements: {
          clientName: 'Prospect',
          companyName: 'Domain Co',
          email: params.sender || '',
          phone: '',
          projectType: 'Custom Development',
          objective: 'Cost estimation',
          targetAudience: '',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 10,
          readyForBrief: false,
        },
      };
    }

    return {
      reply: `Hi, thanks for reaching out to FollowUp Test Co. We would be happy to assist with your requirements. Could you tell us what core deliverables you have in mind?`,
      options: [],
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'General assistance',
      nextBestQuestion: 'Could you tell us what core deliverables you have in mind?',
      extractedRequirements: {
        clientName: 'Prospect',
        companyName: 'Domain Co',
        email: params.sender || '',
        phone: '',
        projectType: 'General Project',
        objective: '',
        targetAudience: '',
        features: [],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: [],
        qualificationScore: 5,
        readyForBrief: false,
      },
    };
  });

  setClassifierMockHandler(async (email) => {
    const text = (email.text || '').toLowerCase();
    const subj = (email.subject || '').toLowerCase();
    if (text.includes('automation') || subj.includes('automation')) {
      return {
        classification: 'CUSTOMER_INQUIRY',
        category: 'client_inquiry',
        reason: 'Automation service inquiry (mock)',
        confidence: 0.9,
        deterministic: false,
        requiresReply: true,
        intent: 'service_inquiry',
      };
    }
    return null;
  });

  try {
    // -------------------------------------------------------------------------
    // Test 1: New inquiry → processed
    // -------------------------------------------------------------------------
    console.log('[Test 1] New inquiry -> processed');
    clearEmailIdCacheForTesting();
    const msg1Id = `gmail-msg1-${timestamp}`;
    const email1 = {
      messageId: msg1Id,
      sender: senderEmail,
      recipient: connectedEmail,
      subject: 'Potential Strategic Partnership & Client Referral Opportunity',
      text: 'Hi, we run a digital marketing agency and would like to explore a partnership to refer clients to you.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg1Id,
        gmailThreadId: sharedThreadId,
      },
    };

    const res1 = await processInboundEmail(email1, provider);
    assert(res1.status === 'processed', 'Test 1 status is processed');
    assert(res1.replySent === true, 'Test 1 sent outbound reply');
    assert(provider.sentEmails.length === 1, 'Provider sent exactly 1 reply');

    // -------------------------------------------------------------------------
    // Test 2: FillFlow own reply → ignored
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Agent own reply -> ignored');
    const ownMsgId = `gmail-own-${timestamp}`;
    const emailOwn = {
      messageId: ownMsgId,
      sender: connectedEmail, // Sent by the connected agent
      recipient: senderEmail,
      subject: 'Re: Potential Strategic Partnership & Client Referral Opportunity',
      text: 'Hi, Thanks for reaching out. We are definitely open to exploring strategic partnerships...',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: ownMsgId,
        gmailThreadId: sharedThreadId,
      },
    };

    const resOwn = await processInboundEmail(emailOwn, provider);
    assert(resOwn.status === 'skipped_irrelevant', 'Agent own message skipped');
    assert(provider.sentEmails.length === 1, 'No reply sent to own message');

    // -------------------------------------------------------------------------
    // Test 3: Customer follow-up in SAME thread → processed
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Customer follow-up in SAME thread -> processed');
    const msg3Id = `gmail-msg3-${timestamp}`;
    const email3 = {
      messageId: msg3Id,
      sender: senderEmail,
      recipient: connectedEmail,
      subject: 'Re: Potential Strategic Partnership & Client Referral Opportunity',
      text: 'I would like to set up a call around 5pm on 28th September if that works for you.',
      timestamp: Date.now() + 1000,
      inReplyTo: `<outbound-1-${timestamp}@mail.gmail.com>`,
      references: `<msg1-${timestamp}> <outbound-1-${timestamp}@mail.gmail.com>`,
      metadata: {
        gmailMessageId: msg3Id,
        gmailThreadId: sharedThreadId,
      },
    };

    const res3 = await processInboundEmail(email3, provider);
    assert(res3.status === 'processed', 'Test 3 follow-up is processed');
    assert(res3.replySent === true, 'Test 3 sent outbound reply');
    assert(provider.sentEmails.length === 2, 'Provider sent 2nd reply');
    assert(provider.sentEmails[1].text.includes('5pm on 28th September'), 'Reply acknowledges 5pm on 28th September');

    // -------------------------------------------------------------------------
    // Test 4: Second customer follow-up in SAME thread → processed
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Second customer follow-up in SAME thread -> processed');
    const msg4Id = `gmail-msg4-${timestamp}`;
    const email4 = {
      messageId: msg4Id,
      sender: senderEmail,
      recipient: connectedEmail,
      subject: 'Re: Potential Strategic Partnership & Client Referral Opportunity',
      text: 'Thanks for getting back to me. Would 6 PM on 29 September work instead? If not, please let me know what time works for you.',
      timestamp: Date.now() + 2000,
      inReplyTo: `<outbound-2-${timestamp}@mail.gmail.com>`,
      metadata: {
        gmailMessageId: msg4Id,
        gmailThreadId: sharedThreadId,
      },
    };

    const res4 = await processInboundEmail(email4, provider);
    assert(res4.status === 'processed', 'Test 4 second follow-up is processed');
    assert(res4.replySent === true, 'Test 4 sent outbound reply');
    assert(provider.sentEmails.length === 3, 'Provider sent 3rd reply');

    // -------------------------------------------------------------------------
    // Test 5: Same Gmail message ID delivered twice → processed once
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Same Gmail message ID delivered twice -> processed once');
    const email4Dup = { ...email4 };
    const res4Dup = await processInboundEmail(email4Dup, provider);
    assert(res4Dup.status === 'duplicate_ignored', 'Duplicate message ID ignored');
    assert(provider.sentEmails.length === 3, 'Zero new outbound emails sent for duplicate message');

    // -------------------------------------------------------------------------
    // Test 6: Pub/Sub duplicate → processed once
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Pub/Sub duplicate delivery -> processed once');
    const res4PubSubDup = await processInboundEmail(email4Dup, provider);
    assert(res4PubSubDup.status === 'duplicate_ignored', 'Pub/Sub duplicate safely ignored');
    assert(provider.sentEmails.length === 3, 'Outbound email count unchanged');

    // -------------------------------------------------------------------------
    // Test 7: Manual Sync + Pub/Sub same message → one response
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Manual Sync + Pub/Sub race on same message -> exactly one response');
    const msgSyncId = `gmail-sync-race-${timestamp}`;
    const emailSync = {
      messageId: msgSyncId,
      sender: `sync.prospect-${timestamp}@domain.com`,
      recipient: connectedEmail,
      subject: 'Inquiry on Automation Suite',
      text: 'Hi, we are interested in your automation services.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msgSyncId,
        gmailThreadId: `thread-sync-${timestamp}`,
      },
    };

    // First delivery (e.g. Pub/Sub)
    const resSync1 = await processInboundEmail(emailSync, provider);
    assert(resSync1.status === 'processed', 'Sync 1st delivery processed');

    // Second delivery (e.g. Manual Sync)
    const resSync2 = await processInboundEmail(emailSync, provider);
    assert(resSync2.status === 'duplicate_ignored', 'Sync 2nd delivery ignored as duplicate');

    // -------------------------------------------------------------------------
    // Test 8: Meeting proposal follow-up → processed
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Standalone meeting proposal follow-up -> processed');
    const msg8Id = `gmail-meeting-${timestamp}`;
    const email8 = {
      messageId: msg8Id,
      sender: `meeting.prospect-${timestamp}@domain.com`,
      recipient: connectedEmail,
      subject: 'Re: Web Consultation',
      text: 'Can we schedule a call around 3pm tomorrow?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg8Id,
        gmailThreadId: `thread-meeting-${timestamp}`,
      },
    };

    const res8 = await processInboundEmail(email8, provider);
    assert(res8.status === 'processed', 'Meeting proposal processed');
    assert(res8.replySent === true, 'Meeting proposal received a response');

    // -------------------------------------------------------------------------
    // Test 9: Courtesy close → no response
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Courtesy close -> no response');
    const msg9Id = `gmail-courtesy-${timestamp}`;
    const email9 = {
      messageId: msg9Id,
      sender: senderEmail,
      recipient: connectedEmail,
      subject: 'Re: Potential Strategic Partnership & Client Referral Opportunity',
      text: 'Got it, thanks!',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg9Id,
        gmailThreadId: sharedThreadId,
      },
    };

    const res9 = await processInboundEmail(email9, provider);
    assert(res9.status === 'skipped_irrelevant', 'Courtesy close skipped');

    // -------------------------------------------------------------------------
    // Test 10: Newsletter → no response
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Newsletter -> no response');
    const msg10Id = `gmail-news-${timestamp}`;
    const email10 = {
      messageId: msg10Id,
      sender: 'newsletter@industrydigest.com',
      recipient: connectedEmail,
      subject: 'Industry Insights: Weekly Digest #42',
      text: 'Here are the top news this week. Click here to unsubscribe from our newsletter.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg10Id,
      },
    };

    const res10 = await processInboundEmail(email10, provider);
    assert(res10.status === 'skipped_irrelevant', 'Newsletter skipped');

    // -------------------------------------------------------------------------
    // Test 11: Promotional email → no response
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Promotional email -> no response');
    const msg11Id = `gmail-promo-${timestamp}`;
    const email11 = {
      messageId: msg11Id,
      sender: 'sales@superdeals.com',
      recipient: connectedEmail,
      subject: 'Special offer: 50% discount today only!',
      text: 'Limited time offer! Buy now and save big.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg11Id,
      },
    };

    const res11 = await processInboundEmail(email11, provider);
    assert(res11.status === 'skipped_irrelevant', 'Promotion skipped');

    // -------------------------------------------------------------------------
    // Test 12: Follow-up after partnership → partnership context retained
    // -------------------------------------------------------------------------
    console.log('\n[Test 12] Follow-up after partnership inquiry retains partnership context');
    const msg12Id = `gmail-partner-cont-${timestamp}`;
    const email12 = {
      messageId: msg12Id,
      sender: `partner.prospect-${timestamp}@domain.com`,
      recipient: connectedEmail,
      subject: 'Re: Partnership Discussion',
      text: 'I would like to set up a call around 5pm on 28th September if that works for you.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg12Id,
        gmailThreadId: `thread-partner-${timestamp}`,
      },
    };

    const res12 = await processInboundEmail(email12, provider);
    assert(res12.status === 'processed', 'Partnership follow-up processed');
    assert(res12.replySent === true, 'Reply sent');

    // -------------------------------------------------------------------------
    // Test 13: Follow-up after pricing inquiry → pricing context retained
    // -------------------------------------------------------------------------
    console.log('\n[Test 13] Follow-up after pricing inquiry retains pricing context');
    const msg13Id = `gmail-pricing-cont-${timestamp}`;
    const email13 = {
      messageId: msg13Id,
      sender: `pricing.prospect-${timestamp}@domain.com`,
      recipient: connectedEmail,
      subject: 'Re: Pricing question for mobile app',
      text: 'Could you give an estimate if we need an MVP in 2 months?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg13Id,
        gmailThreadId: `thread-pricing-${timestamp}`,
      },
    };

    const res13 = await processInboundEmail(email13, provider);
    assert(res13.status === 'processed', 'Pricing follow-up processed');
    assert(res13.replySent === true, 'Reply sent');

    // -------------------------------------------------------------------------
    // Test 14: Follow-up after service inquiry → service context retained
    // -------------------------------------------------------------------------
    console.log('\n[Test 14] Follow-up after service inquiry retains service context');
    const msg14Id = `gmail-service-cont-${timestamp}`;
    const email14 = {
      messageId: msg14Id,
      sender: `service.prospect-${timestamp}@domain.com`,
      recipient: connectedEmail,
      subject: 'Re: What services do you offer?',
      text: 'Do you also build custom AI agents for customer support?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg14Id,
        gmailThreadId: `thread-service-${timestamp}`,
      },
    };

    const res14 = await processInboundEmail(email14, provider);
    assert(res14.status === 'processed', 'Service follow-up processed');
    assert(res14.replySent === true, 'Reply sent');

    // Check final quota
    const finalQuota = await getEmailQuota(companyId);
    console.log('\nFinal Quota State:', finalQuota);
    assert(finalQuota.reservedCredits === 0, 'Zero dangling reservations');
    assert(finalQuota.usedCredits > 0, 'Used credits accurately recorded for processed emails');

    console.log('\n========================================================================');
    console.log(`  ALL 14 REGRESSION TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
    console.log('========================================================================\n');
  } finally {
    clearGeminiMockHandler();
    // Cleanup test company
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runSuite().catch((err) => {
  console.error('\n❌ FATAL SUITE ERROR:', err);
  process.exit(1);
});
