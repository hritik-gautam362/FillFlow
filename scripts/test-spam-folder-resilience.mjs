/**
 * Targeted Spam Folder Resilience Test Suite
 *
 * Validates the conservative Spam folder classification path:
 * Test A: Spam + legitimate service inquiry -> NOT automatically discarded; replies; 1 credit
 * Test B: Spam + legitimate partnership inquiry -> NOT automatically discarded; replies; 1 credit
 * Test C: Spam + legitimate investment inquiry -> NOT automatically discarded; replies; 1 credit
 * Test D: Spam + promotional investment scam ("Guaranteed 50% returns! Send ₹10,000 today!") -> Ignored, 0 credits
 * Test E: Spam + advertisement ("50% OFF our SEO software!") -> Ignored, 0 credits
 * Test F: Spam + newsletter ("Weekly business newsletter #42") -> Ignored, 0 credits
 * Test G: Spam + courtesy "Thanks" ("Thanks for your help.") -> Ignored, 0 credits
 * Test H: Message moved Inbox -> Spam -> Duplicate ignored, 0 duplicate replies
 * Test I: Message moved Spam -> Inbox -> Duplicate ignored, 0 duplicate replies
 *
 * Asserts 100% mocked execution and EXACTLY 0 live Gemini API calls!
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

// Always use 'ws' in Node.js environment
neonConfig.webSocketConstructor = ws;

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService.ts';
import {
  classifyDeterministically,
  classifyInboundEmail,
} from '../src/lib/services/email/emailClassifier.ts';
import {
  setGeminiMockHandler,
  clearGeminiMockHandler,
  getRealGeminiCallCount,
  resetRealGeminiCallCount,
} from '../src/lib/ai/gemini.ts';
import { activateAutomation } from '../src/lib/services/automationAccessService.ts';
import { updateAutomationConnection } from '../src/lib/services/automationConnectionService.ts';
import { getEmailQuota } from '../src/lib/services/emailQuotaService.ts';

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

async function runSpamFolderTestSuite() {
  console.log('\n========================================================================');
  console.log('       SPAM FOLDER CONSERVATIVE CLASSIFICATION TEST SUITE               ');
  console.log('========================================================================\n');

  resetRealGeminiCallCount();

  // Mock Gemini response generator for test isolation
  setGeminiMockHandler((params) => {
    const text = params.latestMessage.toLowerCase();
    const company = params.companyContext;
    const services = company?.services?.join(', ') || 'general contracting and renovation';

    if (text.includes('what services') || text.includes('found your company online')) {
      return {
        reply: `Hello! At ${company?.name || 'our company'}, we specialize in ${services}. What specific requirements or project are you looking to discuss?`,
        options: ['Project Scope', 'Request Quote', 'Schedule Call'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Provided company services overview',
        nextBestQuestion: 'What specific requirements or project are you looking to discuss?',
        extractedRequirements: {
          projectType: 'General Services Inquiry',
          objective: 'Exploring company service offerings',
          budget: '',
          timeline: '',
          features: [],
          techStack: [],
          targetAudience: '',
          missingFields: ['budget', 'timeline'],
          qualificationScore: 40,
          readyForBrief: false,
        },
      };
    }

    if (text.includes('partner') || text.includes('partnership')) {
      return {
        reply: `Thank you for reaching out regarding a partnership. We would be pleased to explore potential synergies with your firm. Would you be available for a brief introductory call this week?`,
        options: ['Schedule Call', 'Share Proposal'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Welcomed partnership discussion',
        nextBestQuestion: 'Would you be available for an introductory call?',
        extractedRequirements: {
          projectType: 'Partnership / Collaboration',
          objective: 'Explore strategic partnership',
          budget: '',
          timeline: '',
          features: [],
          techStack: [],
          targetAudience: '',
          missingFields: [],
          qualificationScore: 50,
          readyForBrief: false,
        },
      };
    }

    if (text.includes('invest') || text.includes('investment')) {
      return {
        reply: `Thank you for your interest in investing in our company. We welcome strategic discussions with potential investors. Could you share your investment focus or arrange a suitable time for a leadership call?`,
        options: ['Schedule Investment Call', 'Request Pitch Deck'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Welcomed investment inquiry',
        nextBestQuestion: 'Could you share your investment focus or arrange a suitable time for a leadership call?',
        extractedRequirements: {
          projectType: 'Investment Discussion',
          objective: 'Strategic investment inquiry',
          budget: '',
          timeline: '',
          features: [],
          techStack: [],
          targetAudience: '',
          missingFields: [],
          qualificationScore: 50,
          readyForBrief: false,
        },
      };
    }

    return {
      reply: 'Thank you for reaching out. How can we best assist your business today?',
      options: ['Learn More'],
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: null,
      nextBestQuestion: 'How can we best assist your business today?',
      extractedRequirements: {
        projectType: 'General Inquiry',
        objective: '',
        budget: '',
        timeline: '',
        features: [],
        techStack: [],
        targetAudience: '',
        missingFields: [],
        qualificationScore: 20,
        readyForBrief: false,
      },
    };
  });

  // Setup test company & connection
  const companyId = 'test-spam-corp-' + Date.now();
  const connectedEmail = `bot-${Date.now()}@spamtest.com`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: `Spam Test Corp ${Date.now()}`,
      industry: 'Commercial Construction & Design',
    },
  });

  await activateAutomation(companyId, AutomationType.email);

  await updateAutomationConnection(companyId, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: connectedEmail,
    metadata: {
      googleEmail: connectedEmail,
      services: ['Commercial Renovations', 'Architectural Design', 'Turnkey Fit-Outs'],
      description: 'Commercial interior construction and design firm',
    },
  });

  const mockProvider = new GoogleProvider({
    connectedEmail,
    simulated: true,
  });

  try {
    // -------------------------------------------------------------------------
    // TEST A: Spam + Legitimate Service Inquiry
    // -------------------------------------------------------------------------
    console.log('[Test A] Spam Folder + Legitimate Service Inquiry');
    {
      const emailA = {
        messageId: `gmail-spam-service-${Date.now()}`,
        sender: `prospect.a.${Date.now()}@realbusiness.com`,
        senderName: 'David Lee',
        recipient: connectedEmail,
        subject: 'Query for the website',
        text: 'Hi, I found your company online. What services do you provide?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-service-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailA);
      assert(classRes !== null, 'Case A classified deterministically');
      assert(classRes.classification === 'CUSTOMER_INQUIRY', 'Case A classified as CUSTOMER_INQUIRY');
      assert(classRes.requiresReply === true, 'Case A requiresReply is true despite SPAM label');
      assert(classRes.intent === 'service_inquiry', 'Case A intent is service_inquiry');
      assert(classRes.confidence >= 0.88, `Case A has high confidence (confidence=${classRes.confidence})`);

      const initialQuota = await getEmailQuota(companyId);
      const processRes = await processInboundEmail(emailA, mockProvider);
      const finalQuota = await getEmailQuota(companyId);

      assert(processRes.success === true, 'Case A processed successfully');
      assert(processRes.replySent === true, 'Case A sent automated reply');
      assert(finalQuota.usedCredits === initialQuota.usedCredits + 1, 'Case A consumed exactly 1 quota credit');
    }

    // -------------------------------------------------------------------------
    // TEST B: Spam + Legitimate Partnership Inquiry
    // -------------------------------------------------------------------------
    console.log('\n[Test B] Spam Folder + Legitimate Partnership Inquiry');
    {
      const emailB = {
        messageId: `gmail-spam-partner-${Date.now()}`,
        sender: `director.b.${Date.now()}@synergycorp.com`,
        senderName: 'Elena Rostova',
        recipient: connectedEmail,
        subject: 'Partnership opportunity',
        text: 'Hi, we are interested in partnering with your company. Can we schedule a discussion?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-partner-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailB);
      assert(classRes.classification === 'CUSTOMER_INQUIRY', 'Case B classified as CUSTOMER_INQUIRY');
      assert(classRes.requiresReply === true, 'Case B requiresReply is true despite SPAM label');
      assert(classRes.intent === 'partnership', 'Case B intent is partnership');

      const processRes = await processInboundEmail(emailB, mockProvider);
      assert(processRes.success === true, 'Case B processed successfully');
      assert(processRes.replySent === true, 'Case B sent automated reply for partnership inquiry');
    }

    // -------------------------------------------------------------------------
    // TEST C: Spam + Legitimate Investment Inquiry
    // -------------------------------------------------------------------------
    console.log('\n[Test C] Spam Folder + Legitimate Investment Inquiry');
    {
      const emailC = {
        messageId: `gmail-spam-invest-${Date.now()}`,
        sender: `partner.c.${Date.now()}@growthfund.com`,
        senderName: 'Marcus Vance',
        recipient: connectedEmail,
        subject: 'Investment discussion',
        text: 'We are interested in investing in your company. Can we schedule a discussion?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-invest-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailC);
      assert(classRes.classification === 'CUSTOMER_INQUIRY', 'Case C classified as CUSTOMER_INQUIRY');
      assert(classRes.requiresReply === true, 'Case C requiresReply is true despite SPAM label');
      assert(classRes.intent === 'investment', 'Case C intent is investment');

      const processRes = await processInboundEmail(emailC, mockProvider);
      assert(processRes.success === true, 'Case C processed successfully');
      assert(processRes.replySent === true, 'Case C sent automated reply for investment inquiry');
    }

    // -------------------------------------------------------------------------
    // TEST D: Spam + Promotional Investment Scam
    // -------------------------------------------------------------------------
    console.log('\n[Test D] Spam Folder + Promotional Investment Scam');
    {
      const emailD = {
        messageId: `gmail-spam-scam-${Date.now()}`,
        sender: 'quickmoney@getrichdaily.biz',
        senderName: 'Fast Returns',
        recipient: connectedEmail,
        subject: 'Guaranteed 50% investment returns! Send ₹10,000 today!',
        text: 'Guaranteed 50% investment returns! Send ₹10,000 today! Click here now to claim your share of passive income.',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-scam-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailD);
      assert(classRes.classification === 'SPAM', 'Case D classified as SPAM');
      assert(classRes.requiresReply === false, 'Case D requiresReply is false');
      assert(classRes.deterministic === true, 'Case D filtered deterministically');

      const initialQuota = await getEmailQuota(companyId);
      const processRes = await processInboundEmail(emailD, mockProvider);
      const finalQuota = await getEmailQuota(companyId);

      assert(processRes.status === 'skipped_irrelevant', 'Case D skipped as irrelevant');
      assert(processRes.replySent !== true, 'Case D sent 0 automated replies');
      assert(finalQuota.usedCredits === initialQuota.usedCredits, 'Case D consumed 0 quota credits');
    }

    // -------------------------------------------------------------------------
    // TEST E: Spam + Advertisement
    // -------------------------------------------------------------------------
    console.log('\n[Test E] Spam Folder + Advertisement');
    {
      const emailE = {
        messageId: `gmail-spam-ad-${Date.now()}`,
        sender: 'marketing@seoagencypro.net',
        senderName: 'SEO Agency',
        recipient: connectedEmail,
        subject: '50% OFF our SEO software!',
        text: 'Take advantage of our limited time offer: 50% OFF our SEO software for the next 48 hours only.',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-ad-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailE);
      assert(classRes.classification === 'PROMOTIONAL', 'Case E classified as PROMOTIONAL');
      assert(classRes.requiresReply === false, 'Case E requiresReply is false');

      const processRes = await processInboundEmail(emailE, mockProvider);
      assert(processRes.status === 'skipped_irrelevant', 'Case E skipped without reply');
      assert(processRes.replySent !== true, 'Case E sent 0 replies');
    }

    // -------------------------------------------------------------------------
    // TEST F: Spam + Newsletter
    // -------------------------------------------------------------------------
    console.log('\n[Test F] Spam Folder + Newsletter');
    {
      const emailF = {
        messageId: `gmail-spam-news-${Date.now()}`,
        sender: 'digest@globalindustry.org',
        senderName: 'Industry Digest',
        recipient: connectedEmail,
        subject: 'Weekly business newsletter #42',
        text: 'Welcome to edition #42 of our weekly digest covering construction market trends.',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-news-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailF);
      assert(classRes.classification === 'NEWSLETTER', 'Case F classified as NEWSLETTER');
      assert(classRes.requiresReply === false, 'Case F requiresReply is false');

      const processRes = await processInboundEmail(emailF, mockProvider);
      assert(processRes.status === 'skipped_irrelevant', 'Case F skipped without reply');
    }

    // -------------------------------------------------------------------------
    // TEST G: Spam + Courtesy "Thanks"
    // -------------------------------------------------------------------------
    console.log('\n[Test G] Spam Folder + Courtesy Close ("Thanks for your help.")');
    {
      const emailG = {
        messageId: `gmail-spam-thanks-${Date.now()}`,
        sender: `client.g.${Date.now()}@acme.com`,
        senderName: 'Client G',
        recipient: connectedEmail,
        subject: 'Re: Previous discussion',
        text: 'Thanks for your help.',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: `gmail-spam-thanks-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailG);
      assert(classRes.classification === 'IRRELEVANT', 'Case G classified as IRRELEVANT');
      assert(classRes.requiresReply === false, 'Case G requiresReply is false');
      assert(classRes.intent === 'courtesy', 'Case G intent is courtesy');

      const processRes = await processInboundEmail(emailG, mockProvider);
      assert(processRes.replySent !== true, 'Case G sent 0 automatic replies');
    }

    // -------------------------------------------------------------------------
    // TEST H: Message moved Inbox -> Spam (No Duplicate Processing / Reply)
    // -------------------------------------------------------------------------
    console.log('\n[Test H] Message Moved: Inbox -> Spam (Strict Idempotency)');
    {
      const sharedMessageId = `gmail-shared-h-${Date.now()}`;
      const senderH = `prospect.h.${Date.now()}@enterprise.com`;

      // 1. First delivered to INBOX
      const inboxEmail = {
        messageId: sharedMessageId,
        sender: senderH,
        senderName: 'Enterprise Client',
        recipient: connectedEmail,
        subject: 'Website & Renovation Proposal Request',
        text: 'What services do you provide for commercial turnkey projects?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['INBOX'],
          gmailMessageId: sharedMessageId,
        },
      };

      const resInbox = await processInboundEmail(inboxEmail, mockProvider);
      assert(resInbox.success === true, 'First delivery to Inbox processed successfully');
      assert(resInbox.replySent === true, 'First delivery sent 1 automated reply');

      // 2. User or filter moves same message to SPAM
      const spamMoveEmail = {
        messageId: sharedMessageId,
        sender: senderH,
        senderName: 'Enterprise Client',
        recipient: connectedEmail,
        subject: 'Website & Renovation Proposal Request',
        text: 'What services do you provide for commercial turnkey projects?',
        timestamp: Date.now() + 1000,
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: sharedMessageId,
        },
      };

      const initialQuota = await getEmailQuota(companyId);
      const resSpam = await processInboundEmail(spamMoveEmail, mockProvider);
      const finalQuota = await getEmailQuota(companyId);

      assert(resSpam.status === 'duplicate_ignored', 'Second delivery in Spam safely ignored as duplicate');
      assert(finalQuota.usedCredits === initialQuota.usedCredits, 'Second delivery consumed 0 additional credits');
    }

    // -------------------------------------------------------------------------
    // TEST I: Message moved Spam -> Inbox (No Duplicate Processing / Reply)
    // -------------------------------------------------------------------------
    console.log('\n[Test I] Message Moved: Spam -> Inbox (Strict Idempotency)');
    {
      const sharedMessageId = `gmail-shared-i-${Date.now()}`;
      const senderI = `founder.i.${Date.now()}@innovate.com`;

      // 1. First arrives in SPAM folder
      const spamEmail = {
        messageId: sharedMessageId,
        sender: senderI,
        senderName: 'Innovate Founder',
        recipient: connectedEmail,
        subject: 'Partnership exploration',
        text: 'We would like to explore a partnership with your company. Can we schedule a discussion?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['SPAM'],
          gmailMessageId: sharedMessageId,
        },
      };

      const resSpam = await processInboundEmail(spamEmail, mockProvider);
      assert(resSpam.success === true, 'First delivery in Spam processed successfully');
      assert(resSpam.replySent === true, 'First delivery in Spam sent 1 automated reply');

      // 2. User unmarks spam -> moves to INBOX
      const inboxMoveEmail = {
        messageId: sharedMessageId,
        sender: senderI,
        senderName: 'Innovate Founder',
        recipient: connectedEmail,
        subject: 'Partnership exploration',
        text: 'We would like to explore a partnership with your company. Can we schedule a discussion?',
        timestamp: Date.now() + 1000,
        metadata: {
          labelIds: ['INBOX'],
          gmailMessageId: sharedMessageId,
        },
      };

      const initialQuota = await getEmailQuota(companyId);
      const resInbox = await processInboundEmail(inboxMoveEmail, mockProvider);
      const finalQuota = await getEmailQuota(companyId);

      assert(resInbox.status === 'duplicate_ignored', 'Second delivery in Inbox safely ignored as duplicate');
      assert(finalQuota.usedCredits === initialQuota.usedCredits, 'Second delivery consumed 0 additional credits');
    }

    // -------------------------------------------------------------------------
    // TEST J: TRASH Label Strict Exclusion
    // -------------------------------------------------------------------------
    console.log('\n[Test J] TRASH Label Exclusion (Always 0 replies, 0 credits)');
    {
      const emailTrash = {
        messageId: `gmail-trash-${Date.now()}`,
        sender: 'prospect@business.com',
        senderName: 'Trash Sender',
        recipient: connectedEmail,
        subject: 'What services do you provide?',
        text: 'Hi, what services do you provide?',
        timestamp: Date.now(),
        metadata: {
          labelIds: ['TRASH'],
          gmailMessageId: `gmail-trash-${Date.now()}`,
        },
      };

      const classRes = classifyDeterministically(emailTrash);
      assert(classRes.classification === 'IRRELEVANT', 'Trash message classified as IRRELEVANT');
      assert(classRes.requiresReply === false, 'Trash message requiresReply is false');

      const processRes = await processInboundEmail(emailTrash, mockProvider);
      assert(processRes.status === 'skipped_irrelevant', 'Trash message skipped');
      assert(processRes.replySent !== true, 'Trash message sent 0 replies');
    }

    // -------------------------------------------------------------------------
    // REAL GEMINI CALL AUDIT
    // -------------------------------------------------------------------------
    const realCalls = getRealGeminiCallCount();
    console.log('\n========================================================================');
    console.log(`REAL_GEMINI_CALLS=${realCalls}`);
    console.log(`Total Passed: ${passed}, Failed: ${failed}`);
    console.log('========================================================================\n');

    assert(realCalls === 0, `Automated test suite consumed EXACTLY 0 real Gemini API calls (Actual: ${realCalls})`);
  } finally {
    // Cleanup
    clearGeminiMockHandler();
    clearEmailIdCacheForTesting();
    try {
      await prisma.chatMessage.deleteMany({ where: { lead: { companyId } } });
      await prisma.lead.deleteMany({ where: { companyId } });
      await prisma.automationConnection.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    } catch {
      // Ignore cleanup error
    }
  }
}

runSpamFolderTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
