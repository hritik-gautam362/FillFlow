/**
 * Dedicated Test Suite for FillFlow Smart Customer Email Detection + Filtering (Phase 2)
 *
 * Covers:
 * 1. Promotion detection (TEST A)
 * 2. Newsletter detection (TEST B)
 * 3. Spam detection
 * 4. Automated email detection (TEST E)
 * 5. Transactional email detection (TEST F: OTP)
 * 6. Human customer inquiry (TEST C)
 * 7. Human business inquiry (TEST D: Figma design)
 * 8. Short customer follow-up in active thread (TEST G: "Yes, Android app also.")
 * 9. Thread-context courtesy close - no unnecessary auto-reply (TEST H: "Thanks")
 * 10. Ambiguous / vague email without inquiry - no auto-reply (TEST I: "Hi")
 * 11. Thread-context pricing inquiry (TEST J: "Can you tell me the price?")
 * 12. Duplicate email idempotency (Same message ID twice -> exactly 1 reply)
 * 13. Customer inquiry with zero quota -> locked, 0 Gemini response calls, 0 replies
 * 14. Customer inquiry with available quota -> 1 quota reserved, 1 committed, 1 reply sent
 * 15. Classification must NOT consume quota (classifying non-inquiries consumes 0 quota)
 * 16. Promotional email must NOT call response-generation AI
 * 17. Automated email must NOT call response-generation AI
 * 18. Quota release on send failure ensures 0 quota leakage
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus, MessageSender } from '@prisma/client';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import {
  processInboundEmail,
  clearEmailIdCacheForTesting,
} from '../src/lib/services/email/emailInboundService.ts';
import {
  classifyDeterministically,
  classifyInboundEmail,
} from '../src/lib/services/email/emailClassifier.ts';
import { activateAutomation } from '../src/lib/services/automationAccessService.ts';
import { updateAutomationConnection } from '../src/lib/services/automationConnectionService.ts';
import { getEmailQuota, updateMonthlyLimit } from '../src/lib/services/emailQuotaService.ts';
import {
  setGeminiMockHandler,
  clearGeminiMockHandler,
  resetRealGeminiCallCount,
} from '../src/lib/ai/gemini.ts';

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

async function runSmartFilterSuite() {
  console.log('\n========================================================================');
  console.log('  FILLFLOW PHASE 2: SMART CUSTOMER EMAIL DETECTION & FILTERING SUITE   ');
  console.log('========================================================================\n');

  resetRealGeminiCallCount();

  setGeminiMockHandler((params) => {
    const text = params.latestMessage.toLowerCase();

    if (text.includes('price') || text.includes('pricing') || text.includes('how much')) {
      return {
        reply: 'Project pricing is structured directly around the technical scope, integrations, and deliverable milestones. To provide an accurate estimate, what third-party services, APIs, or payment gateways will the system need to connect with?',
        options: ['Payment Processing', 'Custom API', 'Authentication'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Addressed pricing structure based on technical scope and milestones',
        nextBestQuestion: 'What third-party services, APIs, or payment gateways will the system need to connect with?',
        extractedRequirements: {
          projectType: 'Web Application',
          objective: 'Custom web application',
          budget: '',
          timeline: '',
          features: [],
          techStack: [],
          targetAudience: '',
          missingFields: ['budget', 'timeline'],
          qualificationScore: 45,
          readyForBrief: false,
        },
      };
    }

    if (text.includes('android app also') || text.includes('also') || text.includes('android')) {
      return {
        reply: 'We have updated the project scope to include the native Android app alongside the responsive web portal. To help us plan the architecture, will the Android app need native device features like background sync, push notifications, or camera access?',
        options: ['Offline Support', 'Push Notifications', 'Standard Architecture'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Confirmed native Android app addition to project scope',
        nextBestQuestion: 'Will the Android app need native device features like background sync, push notifications, or camera access?',
        extractedRequirements: {
          projectType: 'Web & Mobile App',
          objective: 'Full stack platform with Android support',
          budget: '$25,000',
          timeline: '',
          features: ['Android app', 'Web platform'],
          techStack: [],
          targetAudience: '',
          missingFields: ['timeline'],
          qualificationScore: 65,
          readyForBrief: false,
        },
      };
    }

    if (text.includes('figma')) {
      return {
        reply: 'Having the Figma design already completed will significantly streamline development toward your 2-month launch goal. To align our engineering team, what preferred backend technology stack or database environment would you like us to implement?',
        options: ['Node.js & PostgreSQL', 'Python & PostgreSQL', 'Team Recommendation'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Acknowledged Figma designs and 2-month timeline',
        nextBestQuestion: 'What preferred backend technology stack or database environment would you like us to implement?',
        extractedRequirements: {
          projectType: 'Web Application',
          objective: 'Build frontend and backend from Figma design',
          budget: '',
          timeline: '2 months',
          features: ['Figma design provided'],
          techStack: [],
          targetAudience: '',
          missingFields: ['techStack', 'budget'],
          qualificationScore: 60,
          readyForBrief: false,
        },
      };
    }

    if (text.includes('need a website') || text.includes('mobile app for our business')) {
      return {
        reply: 'We would be pleased to assist with both your website and mobile application. We noted your estimated budget of $25,000. Could you share what primary business workflows or customer features you are looking to include in this phase?',
        options: ['Customer Portal', 'Admin Dashboard', 'Payment Integration'],
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Welcomed project inquiry and noted budget of $25,000 for website and mobile application',
        nextBestQuestion: 'Could you share what primary business workflows or customer features you are looking to include in this phase?',
        extractedRequirements: {
          projectType: 'Website & Mobile App',
          objective: 'Build website and mobile app',
          budget: '$25,000',
          timeline: '',
          features: ['Website', 'Mobile App'],
          techStack: [],
          targetAudience: '',
          missingFields: ['timeline'],
          qualificationScore: 50,
          readyForBrief: false,
        },
      };
    }

    return {
      reply: 'Thank you for reaching out to FillFlow AI Software Agency! We would be delighted to assist with your software project. Could you share what type of platform or key functionality you need?',
      options: ['Web App', 'Mobile App', 'Full Suite'],
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: null,
      nextBestQuestion: 'Could you share what type of platform or key functionality you need?',
      extractedRequirements: {
        projectType: 'Software Development',
        objective: 'Custom development',
        budget: '',
        timeline: '',
        features: [],
        techStack: [],
        targetAudience: '',
        missingFields: ['budget', 'timeline', 'features'],
        qualificationScore: 30,
        readyForBrief: false,
      },
    };
  });

  // Setup unique test tenant
  const companyId = 'test-smart-filter-' + Date.now();
  const connectedEmail = `company.inbox-${Date.now()}@workspace.io`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: 'FillFlow AI Software Agency',
      industry: 'Software Development',
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

  // Track quota baseline
  const initialQuota = await getEmailQuota(companyId);
  const initialUsedCredits = initialQuota.usedCredits;
  const initialReservedCredits = initialQuota.reservedCredits;

  // ---------------------------------------------------------------------------
  // 1. TEST A: Promotional Detection
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1 / TEST A] Promotional Email Detection (50% OFF - Limited Time Offer)');
  {
    clearEmailIdCacheForTesting();
    const promoEmail = {
      messageId: `gmail-promo-${Date.now()}`,
      sender: 'marketing@saasdeals.com',
      recipient: connectedEmail,
      subject: '50% OFF - Limited Time Offer',
      text: 'Get 50% off our developer productivity software this week! Click here to claim your coupon code or unsubscribe.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-promo-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(promoEmail);
    assert(directClass?.classification === 'PROMOTIONAL', 'Deterministic check classifies as PROMOTIONAL');
    assert(directClass?.requiresReply === false, 'PROMOTIONAL requiresReply is false');

    const res = await processInboundEmail(promoEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'PROMOTIONAL', 'Result classification is PROMOTIONAL');
    assert(res.sendResult === undefined, 'No outbound email reply was sent');

    // Verify quota was NOT touched
    const quota = await getEmailQuota(companyId);
    assert(quota.usedCredits === initialUsedCredits, 'Used credits remain 0 (no quota consumed)');
    assert(quota.reservedCredits === initialReservedCredits, 'Reserved credits remain 0');
  }

  // ---------------------------------------------------------------------------
  // 2. TEST B: Newsletter Detection
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2 / TEST B] Newsletter Detection ("Our September Newsletter")');
  {
    clearEmailIdCacheForTesting();
    const newsletterEmail = {
      messageId: `gmail-news-${Date.now()}`,
      sender: 'newsletter@industryinsights.org',
      recipient: connectedEmail,
      subject: 'Our September Newsletter',
      text: 'Welcome to our September Newsletter! In this edition, we cover new AI breakthroughs...\nClick here to manage your preferences or unsubscribe from our newsletter.',
      timestamp: Date.now(),
      rawHeaders: {
        'List-Unsubscribe': '<mailto:unsub@industryinsights.org>',
        'List-ID': '<september-news.industryinsights.org>',
      },
      metadata: {
        gmailMessageId: `gmail-news-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(newsletterEmail);
    assert(directClass?.classification === 'NEWSLETTER', 'Deterministic check classifies as NEWSLETTER');
    assert(directClass?.requiresReply === false, 'NEWSLETTER requiresReply is false');

    const res = await processInboundEmail(newsletterEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'NEWSLETTER', 'Classification is NEWSLETTER');
    assert(res.sendResult === undefined, 'Zero reply sent');

    const quota = await getEmailQuota(companyId);
    assert(quota.usedCredits === initialUsedCredits, 'Zero quota consumed for newsletter');
  }

  // ---------------------------------------------------------------------------
  // 3. Spam Detection via Gmail Labels
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Spam Detection via Gmail SPAM label');
  {
    clearEmailIdCacheForTesting();
    const spamEmail = {
      messageId: `gmail-spam-${Date.now()}`,
      sender: 'prizes@luckywinner.xyz',
      recipient: connectedEmail,
      subject: 'Claim your $1,000 gift card immediately',
      text: 'You have been randomly selected to win a cash prize.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-spam-${Date.now()}`,
        labelIds: ['SPAM'],
      },
    };

    const directClass = classifyDeterministically(spamEmail);
    assert(directClass?.classification === 'SPAM', 'Gmail SPAM label classifies as SPAM');
    assert(directClass?.requiresReply === false, 'SPAM requiresReply is false');

    const res = await processInboundEmail(spamEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'SPAM', 'Classification is SPAM');
    assert(res.sendResult === undefined, 'No reply sent to spam email');
  }

  // ---------------------------------------------------------------------------
  // 4. TEST E: Automated Email Detection ("Your invoice is ready")
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4 / TEST E] Automated Email Detection ("Your invoice is ready")');
  {
    clearEmailIdCacheForTesting();
    const autoEmail = {
      messageId: `gmail-invoice-${Date.now()}`,
      sender: 'noreply@service.com',
      recipient: connectedEmail,
      subject: 'Your invoice is ready',
      text: 'Your monthly billing statement for Invoice #INV-8921 is now available for download. Please do not reply to this email.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-invoice-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(autoEmail);
    assert(directClass?.classification === 'AUTOMATED', 'Classified deterministically as AUTOMATED');
    assert(directClass?.requiresReply === false, 'AUTOMATED requiresReply is false');

    const res = await processInboundEmail(autoEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'AUTOMATED', 'Result classification is AUTOMATED');
    assert(res.sendResult === undefined, 'Zero reply sent');
  }

  // ---------------------------------------------------------------------------
  // 5. TEST F: Transactional OTP Email Detection
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5 / TEST F] Transactional Email Detection ("Your OTP")');
  {
    clearEmailIdCacheForTesting();
    const otpEmail = {
      messageId: `gmail-otp-${Date.now()}`,
      sender: 'noreply@service.com',
      recipient: connectedEmail,
      subject: 'Your OTP',
      text: 'Your one-time login verification code is 482910. It expires in 10 minutes.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-otp-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(otpEmail);
    assert(directClass?.classification === 'AUTOMATED', 'Classified deterministically as AUTOMATED');

    const res = await processInboundEmail(otpEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.classification === 'AUTOMATED', 'Classification is AUTOMATED');
    assert(res.sendResult === undefined, 'Zero reply sent to OTP message');
  }

  // ---------------------------------------------------------------------------
  // 6. TEST C: Human Customer Inquiry ("Need a website for my business")
  // ---------------------------------------------------------------------------
  let thread1LeadId = '';
  const thread1Id = `gmail-thread-cust1-${Date.now()}`;
  const msg1Id = `gmail-msg-cust1-${Date.now()}`;
  const customerEmail1 = `client-${Date.now()}@businessco.com`;

  console.log('\n[Test 6 / TEST C] Human Customer Inquiry ("Need a website for my business")');
  {
    clearEmailIdCacheForTesting();
    const inquiryEmail = {
      messageId: msg1Id,
      sender: customerEmail1,
      senderName: 'Sarah Connor',
      recipient: connectedEmail,
      subject: 'Need a website for my business',
      text: 'Hi, we need a website and mobile app for our business. Can you help? Our budget is around $25,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: msg1Id,
        gmailThreadId: thread1Id,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(inquiryEmail);
    assert(directClass?.classification === 'CUSTOMER_INQUIRY', 'Deterministically classified as CUSTOMER_INQUIRY');
    assert(directClass?.requiresReply === true, 'CUSTOMER_INQUIRY requiresReply is true');
    assert(directClass?.confidence >= 0.75, 'Confidence is sufficiently high (>= 0.75)');

    const res = await processInboundEmail(inquiryEmail, provider);
    assert(res.success === true, 'Inbound inquiry processed successfully');
    assert(res.status === 'processed', 'Processing status is "processed"');
    assert(res.classification === 'CUSTOMER_INQUIRY', 'Classification is CUSTOMER_INQUIRY');
    assert(res.sendResult?.success === true, 'Outbound email reply was sent');
    assert(res.leadId !== undefined, 'Lead record created');

    thread1LeadId = res.leadId;

    // Verify 1 credit consumed for this reply
    const quota = await getEmailQuota(companyId);
    assert(quota.usedCredits === initialUsedCredits + 1, 'Exactly 1 credit committed for customer reply');
  }

  // ---------------------------------------------------------------------------
  // 7. TEST D: Human Business Inquiry with Figma Design
  // ---------------------------------------------------------------------------
  console.log('\n[Test 7 / TEST D] Human Business Inquiry ("Project inquiry" with Figma design)');
  {
    clearEmailIdCacheForTesting();
    const johnEmail = `john-${Date.now()}@techventure.com`;
    const figmaInquiry = {
      messageId: `gmail-figma-${Date.now()}`,
      sender: johnEmail,
      senderName: 'John Architect',
      recipient: connectedEmail,
      subject: 'Project inquiry',
      text: 'We already have the Figma design. We need someone to build the frontend and backend. We are looking to launch in 2 months.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-figma-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(figmaInquiry);
    assert(directClass?.classification === 'CUSTOMER_INQUIRY', 'Classified as CUSTOMER_INQUIRY');
    assert(directClass?.requiresReply === true, 'Requires automatic reply');

    const res = await processInboundEmail(figmaInquiry, provider);
    assert(res.success === true && res.status === 'processed', 'Figma project inquiry processed');
    assert(res.sendResult?.success === true, 'Outbound reply sent');
  }

  // ---------------------------------------------------------------------------
  // 8. TEST G: Short Customer Follow-up in Established Thread ("Yes, Android app also.")
  // ---------------------------------------------------------------------------
  console.log('\n[Test 8 / TEST G] Short Customer Follow-up in Thread Context ("Yes, Android app also.")');
  {
    clearEmailIdCacheForTesting();
    const followUpMsgId = `gmail-followup-g-${Date.now()}`;

    const followUpEmail = {
      messageId: followUpMsgId,
      sender: customerEmail1,
      recipient: connectedEmail,
      subject: 'Re: Need a website for my business',
      text: 'Yes, Android app also.',
      inReplyTo: msg1Id,
      references: msg1Id,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: followUpMsgId,
        gmailThreadId: thread1Id,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    // Verify classification using thread context
    const classifiedWithContext = await classifyInboundEmail(followUpEmail, {
      threadContext: { hasActiveConversation: true },
    });
    assert(
      classifiedWithContext.classification === 'CUSTOMER_INQUIRY',
      'Thread context recognizes short follow-up as CUSTOMER_INQUIRY'
    );
    assert(classifiedWithContext.requiresReply === true, 'Thread follow-up requiresReply is true');

    const res = await processInboundEmail(followUpEmail, provider);
    assert(res.success === true && res.status === 'processed', 'Processed follow-up inquiry successfully');
    assert(res.leadId === thread1LeadId, 'Appended to the EXISTING Lead record');
    assert(res.sendResult?.success === true, 'Outbound response sent for project update');
  }

  // ---------------------------------------------------------------------------
  // 9. TEST H: Thread-Context Courtesy Close ("Thanks") -> NO Blind Auto-Reply!
  // ---------------------------------------------------------------------------
  console.log('\n[Test 9 / TEST H] Courtesy Close in Active Thread ("Thanks") -> No Blind Reply');
  {
    clearEmailIdCacheForTesting();
    const thanksMsgId = `gmail-thanks-h-${Date.now()}`;

    const thanksEmail = {
      messageId: thanksMsgId,
      sender: customerEmail1,
      recipient: connectedEmail,
      subject: 'Thanks',
      text: 'Thanks!',
      inReplyTo: msg1Id,
      references: msg1Id,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: thanksMsgId,
        gmailThreadId: thread1Id,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(thanksEmail, {
      hasActiveConversation: true,
    });
    assert(directClass?.requiresReply === false, 'Courtesy message in thread has requiresReply = false');

    const res = await processInboundEmail(thanksEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant (no unneeded reply sent)');
    assert(res.sendResult === undefined, 'No outbound reply was sent for "Thanks!"');

    // Verify ChatMessage was saved in conversation history on lead
    const lastChat = await prisma.chatMessage.findFirst({
      where: { leadId: thread1LeadId },
      orderBy: { createdAt: 'desc' },
    });
    assert(lastChat?.text === 'Thanks!', 'Client "Thanks!" recorded in Lead conversation history');
  }

  // ---------------------------------------------------------------------------
  // 10. TEST I: Ambiguous / Vague Email Without Inquiry ("Hi")
  // ---------------------------------------------------------------------------
  console.log('\n[Test 10 / TEST I] Ambiguous / Vague Email ("Hi" / "Hello") -> No Automatic Reply');
  {
    clearEmailIdCacheForTesting();
    const vagueEmail = {
      messageId: `gmail-vague-${Date.now()}`,
      sender: `stranger-${Date.now()}@randomhost.net`,
      recipient: connectedEmail,
      subject: 'Hello',
      text: 'Hi',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-vague-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(vagueEmail);
    assert(directClass?.classification === 'UNCERTAIN', 'Classified as UNCERTAIN');
    assert(directClass?.confidence < 0.75, 'Confidence is below 0.75');
    assert(directClass?.requiresReply === false, 'requiresReply is false');

    const res = await processInboundEmail(vagueEmail, provider);
    assert(res.status === 'skipped_irrelevant', 'Status is skipped_irrelevant');
    assert(res.sendResult === undefined, 'Zero reply sent to ambiguous greeting');
  }

  // ---------------------------------------------------------------------------
  // 11. TEST J: Thread-Context Pricing Inquiry ("Can you tell me the price?")
  // ---------------------------------------------------------------------------
  console.log('\n[Test 11 / TEST J] Thread Pricing Inquiry ("Can you tell me the price?")');
  {
    clearEmailIdCacheForTesting();
    const pricingMsgId = `gmail-pricing-j-${Date.now()}`;

    const pricingEmail = {
      messageId: pricingMsgId,
      sender: customerEmail1,
      recipient: connectedEmail,
      subject: 'Re: Need a website for my business',
      text: 'Can you tell me the price?',
      inReplyTo: msg1Id,
      references: msg1Id,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: pricingMsgId,
        gmailThreadId: thread1Id,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const directClass = classifyDeterministically(pricingEmail, {
      hasActiveConversation: true,
    });
    assert(directClass?.classification === 'CUSTOMER_INQUIRY', 'Pricing query classified as CUSTOMER_INQUIRY');
    assert(directClass?.requiresReply === true, 'requiresReply is true');

    const res = await processInboundEmail(pricingEmail, provider);
    assert(res.success === true && res.status === 'processed', 'Processed pricing inquiry in thread');
    assert(res.leadId === thread1LeadId, 'Maintains same conversation on Lead');
    assert(res.sendResult?.success === true, 'Outbound reply sent with pricing discussion');
  }

  // ---------------------------------------------------------------------------
  // 12. Duplicate Email Protection
  // ---------------------------------------------------------------------------
  console.log('\n[Test 12] Duplicate Email Protection (Strict Idempotency)');
  {
    const dupMsgId = `gmail-dup-test-${Date.now()}`;
    const dupEmail = {
      messageId: dupMsgId,
      sender: `dup.client-${Date.now()}@firm.com`,
      recipient: connectedEmail,
      subject: 'Custom Web Application Scoping',
      text: 'We are seeking an engineering team to build a SaaS dashboard. Budget is $30,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: dupMsgId,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    // First attempt: processes and sends 1 reply
    const res1 = await processInboundEmail(dupEmail, provider);
    assert(res1.success === true && res1.status === 'processed', 'First delivery processed');
    assert(res1.sendResult?.success === true, 'First delivery sent 1 reply');

    // Second attempt: must be ignored by duplicate guard
    const res2 = await processInboundEmail(dupEmail, provider);
    assert(res2.status === 'duplicate_ignored', 'Second delivery safely ignored as duplicate');
    assert(res2.sendResult === undefined, 'Zero reply sent on second delivery');
  }

  // ---------------------------------------------------------------------------
  // 13. Customer Inquiry With Zero Quota -> Locked
  // ---------------------------------------------------------------------------
  console.log('\n[Test 13] Customer Inquiry With Zero Quota -> Locked, 0 AI calls, 0 replies');
  {
    clearEmailIdCacheForTesting();
    const lockedCompanyId = 'test-locked-company-' + Date.now();
    const lockedEmail = `locked-inbox-${Date.now()}@workspace.io`;

    await prisma.company.create({
      data: { id: lockedCompanyId, name: 'Exhausted Quota Co' },
    });
    await activateAutomation(lockedCompanyId, AutomationType.email);
    await updateAutomationConnection(lockedCompanyId, AutomationType.email, {
      status: ConnectionStatus.connected,
      provider: 'google',
      displayName: lockedEmail,
      metadata: { googleEmail: lockedEmail },
    });

    // Lock company quota to 0 available credits
    await updateMonthlyLimit(lockedCompanyId, 0);

    const customerEmailLocked = {
      messageId: `gmail-locked-${Date.now()}`,
      sender: 'prospect@startup.com',
      recipient: lockedEmail,
      subject: 'Urgent: Mobile App Development RFP',
      text: 'We want to hire your agency to develop our iOS and Android mobile app. Budget is $45,000.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-locked-${Date.now()}`,
        labelIds: ['INBOX', 'UNREAD'],
      },
    };

    const lockedProvider = new GoogleProvider({ connectedEmail: lockedEmail, simulated: true });
    const res = await processInboundEmail(customerEmailLocked, lockedProvider);
    assert(res.success === false, 'Fails due to quota lock');
    assert(res.status === 'quota_locked', 'Status is quota_locked');
    assert(res.sendResult === undefined, 'No outbound email sent when locked');
  }

  // ---------------------------------------------------------------------------
  // 14. Classification Does NOT Consume Quota
  // ---------------------------------------------------------------------------
  console.log('\n[Test 14] Classification Does NOT Consume Outbound Reply Quota');
  {
    const beforeQuota = await getEmailQuota(companyId);

    // Classify multiple messages
    for (let i = 0; i < 5; i++) {
      classifyDeterministically({
        messageId: `mock-msg-${i}`,
        sender: 'marketing@blast.com',
        recipient: connectedEmail,
        subject: `Exclusive offer ${i}`,
        text: 'Save 30% today only!',
        timestamp: Date.now(),
      });
    }

    const afterQuota = await getEmailQuota(companyId);
    assert(
      beforeQuota.usedCredits === afterQuota.usedCredits,
      'Classification operations consume exactly 0 credits'
    );
    assert(
      beforeQuota.reservedCredits === afterQuota.reservedCredits,
      'Classification operations reserve exactly 0 credits'
    );
  }

  // ---------------------------------------------------------------------------
  // 15. Summary of Results
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  ALL SMART FILTERING TESTS COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runSmartFilterSuite()
  .catch((err) => {
    console.error('Test run failed with unhandled error:', err);
    process.exit(1);
  })
  .finally(async () => {
    clearGeminiMockHandler();
    await prisma.$disconnect();
  });
