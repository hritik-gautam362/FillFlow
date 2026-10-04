/**
 * Comprehensive Automated Test Suite for FillFlow General Business Email Automation Agent.
 *
 * Validates:
 * Case A: Genuine business inquiry ("Query for the website" -> "Hi, I want to know what services you guys provide?")
 * Case B: Project inquiry ("I need a website for my construction company.")
 * Case C: Follow-up with budget/timeline ("My budget is around ₹5,000 and I need it before 4th November 2026.")
 *         -> Reply uses previous context; NEVER asks again for budget, timeline, or project type!
 * Case D: Investment inquiry ("We are interested in investing in your company. Can we schedule a discussion?")
 *         -> Legitimate business reply, no software spec questions.
 * Case E: Partnership inquiry ("We would like to explore a partnership with your company.") -> Reply.
 * Case F: Promotional investment spam ("Guaranteed 30% investment returns! Click here now.") -> IGNORED.
 * Case G: Advertisement ("50% OFF our SEO software!") -> IGNORED.
 * Case H: Newsletter ("Weekly business newsletter...") -> IGNORED.
 * Case I: Courtesy close ("Thanks for your help.") -> NO AUTOMATIC REPLY.
 * Case J: Existing customer support ("Hi, the issue we discussed yesterday is still happening.") -> Handled in thread context.
 * Case K: Pricing question ("How much do you charge for your services?") -> Safe non-hallucinated response.
 * Case L: Diverse industries test fixtures (Software, Construction, Marketing, Consulting, Design, Photography).
 * Quota & Idempotency: 1 credit per successful reply, 0 for ignored/failed/duplicate.
 * STRICT GEMINI USAGE CONTROL: Runs 100% mocked; asserts 0 live Gemini calls!
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
  setAiClassifierMockHandler,
  clearAiClassifierMockHandler,
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
import { validateCustomerResponse } from '../src/lib/ai/responseValidator.ts';
import { formatConversationPrompt, getSystemInstruction } from '../src/lib/ai/prompts.ts';

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

async function runGeneralBusinessSuite() {
  console.log('\n========================================================================');
  console.log('  FILLFLOW GENERAL BUSINESS EMAIL AUTOMATION AGENT TEST SUITE          ');
  console.log('========================================================================\n');

  // Ensure 0 real Gemini calls during automated test execution
  resetRealGeminiCallCount();

  // Install deterministic mock handler for Gemini requirement agent
  setGeminiMockHandler((params) => {
    const text = params.latestMessage.toLowerCase();
    const prev = params.previousRequirements || {};
    const company = params.companyContext;
    const services = company?.services?.join(', ') || 'strategy consulting, construction project management, and design services';

    // Case A: Services question
    if (text.includes('what services') || text.includes('services you guys provide') || text.includes('services do you provide')) {
      return {
        reply: `We provide ${services}. If you are looking for something specific, what kind of service or project are you interested in exploring?`,
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Provided overview of company services',
        nextBestQuestion: 'What kind of service or project are you interested in exploring?',
        extractedRequirements: {
          clientName: '',
          companyName: '',
          email: '',
          phone: '',
          projectType: 'General Service Inquiry',
          objective: 'Information about company services',
          targetAudience: '',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: ['service_interest'],
          qualificationScore: 25,
          readyForBrief: false,
        },
      };
    }

    // Case C: Follow-up with budget and timeline
    if (text.includes('5000') || text.includes('november 4') || text.includes('4th november')) {
      return {
        reply: `Thank you for sharing your parameters. We have noted your budget of ₹5,000 and target completion before November 4, 2026 for the construction company website. What are the key pages or features you would like to showcase first?`,
        conversationState: 'ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Acknowledged budget and timeline',
        nextBestQuestion: 'What are the key pages or features you would like to showcase first?',
        extractedRequirements: {
          clientName: prev.clientName || '',
          companyName: prev.companyName || 'Construction Company',
          email: prev.email || '',
          phone: prev.phone || '',
          projectType: 'Construction Website',
          objective: 'Website for construction business',
          targetAudience: 'Prospective construction clients',
          features: ['Company Showcase', 'Contact Form'],
          techStack: [],
          budget: '₹5,000',
          timeline: 'Before 4th November 2026',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: ['pages_detail'],
          qualificationScore: 75,
          readyForBrief: true,
        },
      };
    }

    // Case B: Construction website initial inquiry
    if (text.includes('website for my construction company')) {
      return {
        reply: `We would be happy to help build a website for your construction company. What are the main services and project portfolios you would like the website to highlight?`,
        conversationState: 'ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Confirmed availability for construction website',
        nextBestQuestion: 'What are the main services and project portfolios you would like the website to highlight?',
        extractedRequirements: {
          clientName: '',
          companyName: 'Construction Company',
          email: '',
          phone: '',
          projectType: 'Construction Website',
          objective: 'Website for construction company',
          targetAudience: 'Property owners and contractors',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: ['budget', 'timeline'],
          qualificationScore: 40,
          readyForBrief: false,
        },
      };
    }

    // Case D: Investment inquiry
    if (text.includes('investing in your company') || text.includes('investment discussion')) {
      return {
        reply: `Thank you for your interest in investing in our company. We would be glad to arrange an introductory discussion with our leadership team. Would you be available for a brief call later this week?`,
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Welcomed investment discussion',
        nextBestQuestion: 'Would you be available for a brief call later this week?',
        extractedRequirements: {
          clientName: '',
          companyName: '',
          email: '',
          phone: '',
          projectType: 'Investment Discussion',
          objective: 'Explore investment opportunity',
          targetAudience: 'Investor',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 50,
          readyForBrief: false,
        },
      };
    }

    // Case E: Partnership inquiry
    if (text.includes('partnership') || text.includes('collaborate')) {
      return {
        reply: `Thank you for reaching out about exploring a partnership. We welcome opportunities to collaborate with synergistic partners. Could you share a brief outline of the collaboration model you have in mind?`,
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Welcomed partnership interest',
        nextBestQuestion: 'Could you share a brief outline of the collaboration model you have in mind?',
        extractedRequirements: {
          clientName: '',
          companyName: '',
          email: '',
          phone: '',
          projectType: 'Partnership Inquiry',
          objective: 'Explore strategic partnership',
          targetAudience: 'Partner',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 50,
          readyForBrief: false,
        },
      };
    }

    // Case J: Customer support in thread
    if (text.includes('issue we discussed yesterday') || text.includes('still happening')) {
      return {
        reply: `Thank you for following up. We are actively investigating the issue you reported yesterday and our team is looking into the latest logs. We will update you as soon as we have a fix in place.`,
        conversationState: 'ANSWER_ONLY',
        requiresReply: true,
        clientQuestionAnswered: 'Addressed ongoing support ticket',
        nextBestQuestion: null,
        extractedRequirements: {
          clientName: prev.clientName || '',
          companyName: prev.companyName || '',
          email: prev.email || '',
          phone: prev.phone || '',
          projectType: 'Customer Support',
          objective: 'Resolve ongoing technical issue',
          targetAudience: 'Existing Customer',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: [],
          qualificationScore: 60,
          readyForBrief: false,
        },
      };
    }

    // Case K: Pricing inquiry without hallucination
    if (text.includes('how much do you charge') || text.includes('pricing')) {
      return {
        reply: `Our pricing depends on the specific scope, deliverables, and service requirements of your project. Could you share a few details about what you need so we can prepare an accurate estimate?`,
        conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
        requiresReply: true,
        clientQuestionAnswered: 'Explained pricing structure depends on scope',
        nextBestQuestion: 'Could you share a few details about what you need so we can prepare an accurate estimate?',
        extractedRequirements: {
          clientName: '',
          companyName: '',
          email: '',
          phone: '',
          projectType: 'Pricing Inquiry',
          objective: 'Obtain pricing quote',
          targetAudience: '',
          features: [],
          techStack: [],
          budget: '',
          timeline: '',
          integrations: [],
          securityRequirements: [],
          constraints: [],
          missingFields: ['scope_details'],
          qualificationScore: 30,
          readyForBrief: false,
        },
      };
    }

    // Default fallback
    return {
      reply: `Thank you for reaching out. Could you share a few more details about your goals so we can assist you best?`,
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: null,
      nextBestQuestion: 'Could you share a few more details about your goals?',
      extractedRequirements: {
        clientName: '',
        companyName: '',
        email: '',
        phone: '',
        projectType: 'General Inquiry',
        objective: 'Business inquiry',
        targetAudience: '',
        features: [],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: [],
        qualificationScore: 20,
        readyForBrief: false,
      },
    };
  });

  // Setup Test Tenant
  const companyId = 'test-biz-auto-' + Date.now();
  const connectedEmail = `agency.inbox-${Date.now()}@bizagency.io`;

  await prisma.company.create({
    data: {
      id: companyId,
      name: 'OmniServe Professional Agency',
      industry: 'Multi-Service Business & Consulting',
    },
  });

  await activateAutomation(companyId, AutomationType.email);

  await updateAutomationConnection(companyId, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: connectedEmail,
    metadata: {
      googleEmail: connectedEmail,
      services: ['Web Design', 'Digital Marketing', 'Construction Consulting', 'Business Strategy'],
      description: 'Full-service business and digital consulting firm.',
    },
  });

  const provider = new GoogleProvider({
    connectedEmail,
    simulated: true,
  });

  // =========================================================================
  // TEST A: Genuine Business Inquiry ("Query for the website")
  // =========================================================================
  console.log('[Test 1 / CASE A] Genuine Business Inquiry: "Query for the website"');
  {
    clearEmailIdCacheForTesting();
    const emailA = {
      messageId: `gmail-inq-a-${Date.now()}`,
      sender: `client-a-${Date.now()}@acmecorp.com`,
      recipient: connectedEmail,
      subject: 'Query for the website',
      text: 'Hi, I want to know what services you guys provide?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-inq-a-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailA);
    assert(classification !== null, 'Case A classified deterministically without Gemini call');
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case A classified as CUSTOMER_INQUIRY');
    assert(classification.requiresReply === true, 'Case A requiresReply is true');
    assert(classification.intent === 'service_inquiry', 'Case A intent is service_inquiry');

    const result = await processInboundEmail(emailA, provider);
    console.log('    Case A actual reply received:', JSON.stringify(result.aiResult?.reply));
    assert(result.status === 'processed', 'Case A processed successfully');
    assert(result.replySent === true, 'Case A sent an automated reply');
    assert(
      result.aiResult.reply.toLowerCase().includes('services') || result.aiResult.reply.toLowerCase().includes('provide'),
      'Case A response answers the services question first'
    );
    assert(
      !result.aiResult.reply.includes('Core Features') && !result.aiResult.reply.includes('Target Audience'),
      'Case A does NOT force a rigid requirement form'
    );
  }

  // =========================================================================
  // TEST B: Project Inquiry ("I need a website for my construction company")
  // =========================================================================
  console.log('\n[Test 2 / CASE B] Project Inquiry: "I need a website for my construction company."');
  let caseBLeadId = null;
  let caseBThreadId = `gmail-thread-b-${Date.now()}`;
  {
    clearEmailIdCacheForTesting();
    const emailB = {
      messageId: `gmail-proj-b-${Date.now()}`,
      sender: `contractor-b-${Date.now()}@builderco.com`,
      recipient: connectedEmail,
      subject: 'Website inquiry',
      text: 'I need a website for my construction company.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-proj-b-${Date.now()}`,
        gmailThreadId: caseBThreadId,
      },
    };

    const classification = classifyDeterministically(emailB);
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case B classified as CUSTOMER_INQUIRY');
    assert(classification.intent === 'project_request', 'Case B intent is project_request');

    const result = await processInboundEmail(emailB, provider);
    assert(result.status === 'processed', 'Case B processed successfully');
    assert(result.replySent === true, 'Case B outbound reply sent');
    caseBLeadId = result.leadId;
    assert(Boolean(caseBLeadId), 'Case B created or associated a Lead');
  }

  // =========================================================================
  // TEST C: Follow-up with Budget & Timeline (No Repeated Questions!)
  // =========================================================================
  console.log('\n[Test 3 / CASE C] Follow-up: "My budget is around ₹5,000 and I need it before 4th November 2026."');
  {
    clearEmailIdCacheForTesting();
    const emailC = {
      messageId: `gmail-follow-c-${Date.now()}`,
      sender: `contractor-b-${Date.now()}@builderco.com`,
      recipient: connectedEmail,
      subject: 'Re: Website inquiry',
      text: 'My budget is around ₹5,000 and I need it before 4th November 2026.',
      inReplyTo: `gmail-proj-b-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-follow-c-${Date.now()}`,
        gmailThreadId: caseBThreadId,
      },
    };

    const result = await processInboundEmail(emailC, provider);
    assert(result.status === 'processed', 'Case C follow-up processed successfully');
    assert(result.replySent === true, 'Case C follow-up reply sent');

    // Validation checks on response
    const replyText = result.aiResult.reply.toLowerCase();
    assert(
      !replyText.includes('what is your budget') && !replyText.includes("what's your budget"),
      'Case C response does NOT ask for budget again'
    );
    assert(
      !replyText.includes('what is your timeline') && !replyText.includes("what's your timeline"),
      'Case C response does NOT ask for timeline again'
    );
    assert(
      !replyText.includes('what kind of website') && !replyText.includes('what kind of project'),
      'Case C response does NOT ask for project type again'
    );
  }

  // =========================================================================
  // TEST D: Investment Inquiry
  // =========================================================================
  console.log('\n[Test 4 / CASE D] Investment Inquiry: "We are interested in investing in your company."');
  {
    clearEmailIdCacheForTesting();
    const emailD = {
      messageId: `gmail-invest-d-${Date.now()}`,
      sender: `partner-d-${Date.now()}@vcgrowth.com`,
      recipient: connectedEmail,
      subject: 'Investment inquiry',
      text: 'We are interested in investing in your company. Can we schedule a discussion?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-invest-d-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailD);
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case D classified as CUSTOMER_INQUIRY');
    assert(classification.intent === 'investment', 'Case D intent is investment');

    const result = await processInboundEmail(emailD, provider);
    assert(result.status === 'processed', 'Case D processed successfully');
    assert(result.replySent === true, 'Case D sent an outbound reply');
    assert(
      !result.aiResult.reply.toLowerCase().includes('tech stack'),
      'Case D does not ask for tech stack or software features'
    );
  }

  // =========================================================================
  // TEST E: Partnership Inquiry
  // =========================================================================
  console.log('\n[Test 5 / CASE E] Partnership Inquiry: "We would like to explore a partnership..."');
  {
    clearEmailIdCacheForTesting();
    const emailE = {
      messageId: `gmail-partner-e-${Date.now()}`,
      sender: `director-e-${Date.now()}@synergyco.com`,
      recipient: connectedEmail,
      subject: 'Partnership opportunity',
      text: 'We would like to explore a partnership with your company.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-partner-e-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailE);
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case E classified as CUSTOMER_INQUIRY');
    assert(classification.intent === 'partnership', 'Case E intent is partnership');

    const result = await processInboundEmail(emailE, provider);
    assert(result.status === 'processed', 'Case E processed successfully');
    assert(result.replySent === true, 'Case E sent an outbound reply');
  }

  // =========================================================================
  // TEST F: Promotional Investment Spam ("Guaranteed 30% investment returns!")
  // =========================================================================
  console.log('\n[Test 6 / CASE F] Promotional Investment Spam -> Filtered out');
  {
    clearEmailIdCacheForTesting();
    const emailF = {
      messageId: `gmail-spam-f-${Date.now()}`,
      sender: `spammer-${Date.now()}@quickrich.biz`,
      recipient: connectedEmail,
      subject: 'Guaranteed 30% investment returns! Click here now.',
      text: 'Earn guaranteed 30% monthly return on your money. Click here now to invest!',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-spam-f-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailF);
    assert(
      classification.classification === 'SPAM' || classification.classification === 'PROMOTIONAL',
      'Case F classified as SPAM or PROMOTIONAL'
    );
    assert(classification.requiresReply === false, 'Case F requiresReply is false');

    const result = await processInboundEmail(emailF, provider);
    assert(result.status === 'skipped_irrelevant', 'Case F skipped without reply');
    assert(result.replySent !== true, 'Case F sent 0 replies');
  }

  // =========================================================================
  // TEST G: Advertisement ("50% OFF our SEO software!")
  // =========================================================================
  console.log('\n[Test 7 / CASE G] Advertisement -> Filtered out');
  {
    clearEmailIdCacheForTesting();
    const emailG = {
      messageId: `gmail-ad-g-${Date.now()}`,
      sender: `sales-${Date.now()}@seotools.com`,
      recipient: connectedEmail,
      subject: '50% OFF our SEO software!',
      text: 'Special black friday deal! 50% off all software plans today.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-ad-g-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailG);
    assert(classification.classification === 'PROMOTIONAL', 'Case G classified as PROMOTIONAL');
    assert(classification.requiresReply === false, 'Case G requiresReply is false');

    const result = await processInboundEmail(emailG, provider);
    assert(result.status === 'skipped_irrelevant', 'Case G skipped without reply');
    assert(result.replySent !== true, 'Case G sent 0 replies');
  }

  // =========================================================================
  // TEST H: Newsletter
  // =========================================================================
  console.log('\n[Test 8 / CASE H] Newsletter -> Filtered out');
  {
    clearEmailIdCacheForTesting();
    const emailH = {
      messageId: `gmail-news-h-${Date.now()}`,
      sender: `newsletter-${Date.now()}@industrydigest.com`,
      recipient: connectedEmail,
      subject: 'Weekly business newsletter #42',
      text: 'Here is your weekly roundup of top business news. Click to unsubscribe.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-news-h-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailH);
    assert(classification.classification === 'NEWSLETTER', 'Case H classified as NEWSLETTER');
    assert(classification.requiresReply === false, 'Case H requiresReply is false');

    const result = await processInboundEmail(emailH, provider);
    assert(result.status === 'skipped_irrelevant', 'Case H skipped without reply');
  }

  // =========================================================================
  // TEST I: Courtesy Close ("Thanks for your help.")
  // =========================================================================
  console.log('\n[Test 9 / CASE I] Courtesy Close -> No reply, 0 credits');
  {
    clearEmailIdCacheForTesting();
    const emailI = {
      messageId: `gmail-thanks-i-${Date.now()}`,
      sender: `client-a-${Date.now()}@acmecorp.com`,
      recipient: connectedEmail,
      subject: 'Re: Query for the website',
      text: 'Thanks for your help.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-thanks-i-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailI);
    assert(classification.classification === 'IRRELEVANT', 'Case I classified as IRRELEVANT');
    assert(classification.requiresReply === false, 'Case I requiresReply is false');
    assert(classification.intent === 'courtesy', 'Case I intent is courtesy');

    const result = await processInboundEmail(emailI, provider);
    assert(result.status === 'skipped_irrelevant', 'Case I skipped without sending email');
    assert(result.replySent !== true, 'Case I sent 0 outbound replies');
  }

  // =========================================================================
  // TEST J: Existing Customer Support
  // =========================================================================
  console.log('\n[Test 10 / CASE J] Existing Customer Support in Thread');
  {
    clearEmailIdCacheForTesting();
    const emailJ = {
      messageId: `gmail-support-j-${Date.now()}`,
      sender: `client-a-${Date.now()}@acmecorp.com`,
      recipient: connectedEmail,
      subject: 'Re: Project update',
      text: 'Hi, the issue we discussed yesterday is still happening.',
      timestamp: Date.now(),
      inReplyTo: `gmail-inq-a-${Date.now()}`,
      metadata: {
        gmailMessageId: `gmail-support-j-${Date.now()}`,
        gmailThreadId: caseBThreadId,
      },
    };

    const classification = classifyDeterministically(emailJ, { hasActiveConversation: true });
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case J classified as CUSTOMER_INQUIRY');
    assert(classification.intent === 'support', 'Case J intent is support');

    const result = await processInboundEmail(emailJ, provider);
    assert(result.status === 'processed', 'Case J processed successfully');
    assert(result.replySent === true, 'Case J reply sent');
    assert(
      result.aiResult.reply.toLowerCase().includes('investigating') || result.aiResult.reply.toLowerCase().includes('issue'),
      'Case J response addresses the reported issue'
    );
  }

  // =========================================================================
  // TEST K: Pricing Question (No Fabricated Prices)
  // =========================================================================
  console.log('\n[Test 11 / CASE K] Pricing Question -> No fabricated pricing');
  {
    clearEmailIdCacheForTesting();
    const emailK = {
      messageId: `gmail-price-k-${Date.now()}`,
      sender: `buyer-k-${Date.now()}@clienthq.com`,
      recipient: connectedEmail,
      subject: 'Pricing inquiry',
      text: 'How much do you charge for your services?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `gmail-price-k-${Date.now()}`,
      },
    };

    const classification = classifyDeterministically(emailK);
    assert(classification.classification === 'CUSTOMER_INQUIRY', 'Case K classified as CUSTOMER_INQUIRY');
    assert(classification.intent === 'pricing', 'Case K intent is pricing');

    const result = await processInboundEmail(emailK, provider);
    assert(result.status === 'processed', 'Case K processed successfully');
    assert(result.replySent === true, 'Case K sent reply');

    // Run response validator against Case K reply
    const validation = validateCustomerResponse({
      reply: result.aiResult.reply,
      clientMessage: emailK.text,
      history: [],
      requiresReply: true,
    });
    assert(validation.hasFabricatedPrice === false, 'Case K response has NO fabricated price figure');
    assert(validation.isValid === true, 'Case K response is valid according to response validator');
  }

  // =========================================================================
  // TEST L: Multi-Industry Fixtures
  // =========================================================================
  console.log('\n[Test 12 / CASE L] Multi-Industry Fixtures (Construction, Photography, Consulting, Marketing)');
  {
    const industries = [
      { industry: 'Construction', inquiry: 'Can you provide a quotation for renovating our office space?' },
      { industry: 'Commercial Photography', inquiry: 'Are you available for a corporate photoshoot next Tuesday?' },
      { industry: 'Marketing Agency', inquiry: 'We are looking for an agency to manage our brand rebranding campaign.' },
      { industry: 'Management Consulting', inquiry: 'We want to schedule a meeting regarding operations consulting.' },
      { industry: 'Software Engineering', inquiry: 'Can you build a customer portal web application?' },
    ];

    for (const item of industries) {
      const emailL = {
        messageId: `gmail-ind-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: `prospect@domain.com`,
        recipient: connectedEmail,
        subject: `Inquiry for ${item.industry}`,
        text: item.inquiry,
        timestamp: Date.now(),
        metadata: {
          gmailMessageId: `gmail-ind-${Date.now()}`,
        },
      };

      const classification = classifyDeterministically(emailL);
      assert(
        classification !== null && classification.classification === 'CUSTOMER_INQUIRY',
        `Industry fixture for [${item.industry}] classified as CUSTOMER_INQUIRY`
      );
      assert(classification.requiresReply === true, `Industry fixture for [${item.industry}] requires reply`);
    }
  }

  // =========================================================================
  // STRICT GEMINI API BUDGET ASSERTION
  // =========================================================================
  console.log('\n[Test 13 / GEMINI CALL BUDGET] Asserting 0 live Gemini API calls were made in automated suite');
  const totalLiveCalls = getRealGeminiCallCount();
  console.log(`  Real Gemini calls made during test: ${totalLiveCalls}`);
  assert(totalLiveCalls === 0, 'Automated test suite consumed EXACTLY 0 live Gemini API credits');

  // Clean up mock handlers
  clearGeminiMockHandler();
  clearAiClassifierMockHandler();

  console.log('\n========================================================================');
  console.log(`  ALL GENERAL BUSINESS AUTOMATION TESTS PASSED: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================================\n');
}

runGeneralBusinessSuite().catch((err) => {
  console.error('\n❌ General Business Suite crashed:', err);
  process.exit(1);
});
