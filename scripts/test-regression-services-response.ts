/**
 * Regression Test Suite: Contextual General Business & Non-Robotic Outbound Responses
 * Tests all required regression scenarios (A through K) for real Gmail pipeline:
 * A. "What services do you provide?" -> Contextual service answer
 * B. Construction company inquiry -> Construction-relevant response
 * C. Photography inquiry -> Photography-relevant response
 * D. Partnership inquiry -> Partnership response (not software questionnaire)
 * E. Investment inquiry -> Investment response (not project intake)
 * F. Follow-up in thread -> Remembers previous conversation context
 * G. Already answered budget -> Does not ask for budget again
 * H. Already answered timeline -> Does not ask for timeline again
 * I. Outbound Email HTML -> No generic "RECOMMENDED OPTIONS / NEXT STEPS"
 * J. Legacy Removal -> No "Scope Overview / Timeline & Availability / Next Steps"
 * K. Gemini Failure -> Safe, context-aware fallback (not canned questionnaire)
 */

import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();
neonConfig.webSocketConstructor = ws;

import { prisma } from '../src/lib/prisma';
import { validateAndNormalizeModelOutput } from '../src/lib/ai/validator';
import { validateCustomerResponse } from '../src/lib/ai/responseValidator';
import { getSystemInstruction, formatConversationPrompt } from '../src/lib/ai/prompts';
import { setGeminiMockHandler, clearGeminiMockHandler } from '../src/lib/ai/gemini';
import { processDiscoveryMessage } from '../src/lib/services/aiDiscoveryService';
import { processInboundEmail, clearEmailIdCacheForTesting } from '../src/lib/services/email/emailInboundService';
import { createCompany } from '../src/lib/services/companyService';
import { activateAutomation } from '../src/lib/services/automationAccessService';
import { updateAutomationConnection } from '../src/lib/services/automationConnectionService';
import { AutomationType, ConnectionStatus, LeadStatus } from '@prisma/client';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
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
  sentEmails: any[] = [];
  readMessageIds = new Set<string>();

  async getMessage() {
    return null;
  }

  async sendMessage(message: any) {
    const providerMessageId = `mock-outbound-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.sentEmails.push({ ...message, providerMessageId });
    return { success: true, providerMessageId };
  }

  async markAsRead(messageId: string) {
    this.readMessageIds.add(messageId);
    return { success: true };
  }

  async hasOutboundReply(threadId: string, messageId: string) {
    return this.sentEmails.some((e) => e.metadata?.incomingGmailMessageId === messageId);
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('  STARTING REGRESSION TEST SUITE: GENERAL BUSINESS OUTBOUND RESPONSES');
  console.log('========================================================================\n');

  const uniqueId = Date.now();
  clearEmailIdCacheForTesting();

  // Create test companies
  const softwareCompany = await createCompany({
    name: `ApexByte Software ${uniqueId}`,
    industry: 'Software Engineering & Cloud Architecture',
  });

  const constructionCompany = await createCompany({
    name: `Apex Build & Construction ${uniqueId}`,
    industry: 'Commercial & Residential Construction',
  });

  const photographyCompany = await createCompany({
    name: `Apex Studio Photography ${uniqueId}`,
    industry: 'Commercial Photography & Video Production',
  });

  // Enable automation
  await activateAutomation(softwareCompany.id, AutomationType.email, null);
  await activateAutomation(constructionCompany.id, AutomationType.email, null);
  await activateAutomation(photographyCompany.id, AutomationType.email, null);

  const mockProvider = new MockEmailProvider();

  // Setup connection metadata with actual services
  await updateAutomationConnection(softwareCompany.id, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: `connect-sw-${uniqueId}@apexbyte.io`,
    metadata: {
      googleEmail: `connect-sw-${uniqueId}@apexbyte.io`,
      services: ['Custom Web & Mobile Development', 'Cloud Infrastructure', 'API Integrations'],
      description: 'We build scalable enterprise digital solutions.',
    },
  });

  await updateAutomationConnection(constructionCompany.id, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: `connect-build-${uniqueId}@apexbyte.io`,
    metadata: {
      googleEmail: `connect-build-${uniqueId}@apexbyte.io`,
      services: ['Commercial Remodeling', 'Custom Home Construction', 'Structural Engineering'],
      description: 'Licensed and insured general contracting firm.',
    },
  });

  await updateAutomationConnection(photographyCompany.id, AutomationType.email, {
    status: ConnectionStatus.connected,
    provider: 'google',
    displayName: `connect-photo-${uniqueId}@apexbyte.io`,
    metadata: {
      googleEmail: `connect-photo-${uniqueId}@apexbyte.io`,
      services: ['Corporate Headshots', 'Product Photography', 'Event & Brand Videography'],
      description: 'High-end studio and on-location photography.',
    },
  });

  // --------------------------------------------------------------------------
  // TEST A: "What services do you provide?" -> Contextual service answer
  // --------------------------------------------------------------------------
  console.log('\n[Test A] "What services do you provide?" -> Contextual service answer');
  setGeminiMockHandler(async (params) => {
    return {
      reply: `Hi there,\n\nThanks for reaching out to ${params.companyContext?.name || 'our company'}! We specialize in ${params.companyContext?.services?.join(', ') || params.companyContext?.industry}.\n\nDo you have a specific project or requirement in mind?`,
      options: [],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Company service offerings',
      nextBestQuestion: 'What specific project or requirement do you have in mind?',
      extractedRequirements: {
        clientName: '',
        companyName: '',
        email: '',
        phone: '',
        projectType: 'Service Inquiry',
        objective: '',
        targetAudience: '',
        features: [],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: ['objective'],
        qualificationScore: 10,
        readyForBrief: false,
      },
    };
  });

  const resA = await processInboundEmail(
    {
      messageId: `msg-a-${uniqueId}`,
      sender: `client-a-${uniqueId}@domain.com`,
      recipient: `connect-sw-${uniqueId}@apexbyte.io`,
      subject: 'Inquiry: What services do you provide?',
      text: 'Hi, I found your company online. What services do you provide?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-a-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resA.success === true, 'Test A processed successfully');
  assert(resA.status === 'processed', 'Status is processed');
  const sentA = mockProvider.sentEmails.find((e) => e.to === `client-a-${uniqueId}@domain.com`);
  assert(Boolean(sentA), 'Outbound email sent for Test A');
  assert(sentA.text.includes('Custom Web & Mobile Development'), 'Test A reply contains actual company services');
  assert(!sentA.text.includes('RECOMMENDED OPTIONS'), 'Test A text does not contain RECOMMENDED OPTIONS');
  assert(!sentA.html.includes('Recommended Options'), 'Test A HTML does not contain Recommended Options box');
  assert(!sentA.html.includes('Scope Overview'), 'Test A HTML does not contain Scope Overview');

  // --------------------------------------------------------------------------
  // TEST B: Construction company inquiry -> Construction-relevant response
  // --------------------------------------------------------------------------
  console.log('\n[Test B] Construction company inquiry -> Construction-relevant response');
  setGeminiMockHandler(async (params) => {
    return {
      reply: `Hello,\n\nThank you for contacting ${params.companyContext?.name}! We offer ${params.companyContext?.services?.join(', ')}.\n\nCould you tell us the location and square footage or scope of your planned renovation?`,
      options: [],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Construction capabilities',
      nextBestQuestion: 'Location and scope of planned renovation',
      extractedRequirements: {
        clientName: '',
        companyName: '',
        email: '',
        phone: '',
        projectType: 'Commercial Remodeling',
        objective: 'Office building renovation',
        targetAudience: '',
        features: ['Flooring', 'HVAC'],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: ['timeline', 'budget'],
        qualificationScore: 25,
        readyForBrief: false,
      },
    };
  });

  const resB = await processInboundEmail(
    {
      messageId: `msg-b-${uniqueId}`,
      sender: `contractor-b-${uniqueId}@domain.com`,
      recipient: `connect-build-${uniqueId}@apexbyte.io`,
      subject: 'Renovation project inquiry',
      text: 'We are planning a commercial office renovation. Can your team handle general contracting and remodeling?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-b-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resB.success === true, 'Test B processed successfully');
  const sentB = mockProvider.sentEmails.find((e) => e.to === `contractor-b-${uniqueId}@domain.com`);
  assert(Boolean(sentB), 'Outbound email sent for Construction inquiry');
  assert(sentB.text.includes('Commercial Remodeling'), 'Test B mentions construction services');
  assert(!sentB.text.includes('tech stack'), 'Test B does not ask for tech stack');

  // --------------------------------------------------------------------------
  // TEST C: Photography inquiry -> Photography-relevant response
  // --------------------------------------------------------------------------
  console.log('\n[Test C] Photography inquiry -> Photography-relevant response');
  setGeminiMockHandler(async (params) => {
    return {
      reply: `Hi,\n\nThanks for reaching out to ${params.companyContext?.name}! We provide ${params.companyContext?.services?.join(', ')}.\n\nCould you share how many team members will need headshots and your target date for the session?`,
      options: [],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Photography services',
      nextBestQuestion: 'Number of team members and target date',
      extractedRequirements: {
        clientName: '',
        companyName: '',
        email: '',
        phone: '',
        projectType: 'Corporate Headshots',
        objective: 'Executive team photoshoot',
        targetAudience: '',
        features: [],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: ['timeline'],
        qualificationScore: 30,
        readyForBrief: false,
      },
    };
  });

  const resC = await processInboundEmail(
    {
      messageId: `msg-c-${uniqueId}`,
      sender: `client-c-${uniqueId}@corp.com`,
      recipient: `connect-photo-${uniqueId}@apexbyte.io`,
      subject: 'Corporate Headshots for our Executive Team',
      text: 'Hi, we need professional headshots for our 15 executive team members in our downtown office. Do you offer on-site corporate shoots?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-c-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resC.success === true, 'Test C processed successfully');
  const sentC = mockProvider.sentEmails.find((e) => e.to === `client-c-${uniqueId}@corp.com`);
  assert(Boolean(sentC), 'Outbound email sent for photography inquiry');
  assert(sentC.text.includes('Corporate Headshots'), 'Test C mentions photography services');
  assert(!sentC.text.includes('database'), 'Test C does not ask for database');

  // --------------------------------------------------------------------------
  // TEST D: Partnership inquiry -> Partnership response, not software questionnaire
  // --------------------------------------------------------------------------
  console.log('\n[Test D] Partnership inquiry -> Partnership response');
  setGeminiMockHandler(async (params) => {
    return {
      reply: `Hi Sarah,\n\nThank you for reaching out regarding a strategic partnership with ${params.companyContext?.name}. We are always open to exploring synergies with design agencies.\n\nWould you be open to a brief introductory call next Tuesday or Wednesday to discuss how we might collaborate?`,
      options: [],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Partnership openness',
      nextBestQuestion: 'Availability for introductory call',
      extractedRequirements: {
        clientName: 'Sarah Jenkins',
        companyName: 'Studio Design Co',
        email: '',
        phone: '',
        projectType: 'Strategic Partnership',
        objective: 'Agency collaboration',
        targetAudience: '',
        features: [],
        techStack: [],
        budget: '',
        timeline: '',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: [],
        qualificationScore: 40,
        readyForBrief: false,
      },
    };
  });

  const resD = await processInboundEmail(
    {
      messageId: `msg-d-${uniqueId}`,
      sender: `sarah-${uniqueId}@studiodesign.co`,
      recipient: `connect-sw-${uniqueId}@apexbyte.io`,
      subject: 'Partnership Exploration: Studio Design Co & ApexByte',
      text: 'Hi ApexByte team, I lead partnerships at Studio Design Co. We often need top-tier engineering partners for our UX clients. Can we explore a collaboration?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-d-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resD.success === true, 'Test D processed successfully');
  const sentD = mockProvider.sentEmails.find((e) => e.to === `sarah-${uniqueId}@studiodesign.co`);
  assert(Boolean(sentD), 'Outbound email sent for partnership inquiry');
  assert(sentD.text.includes('collaboration') || sentD.text.includes('partnership'), 'Test D addresses partnership');
  assert(!sentD.text.includes('target audience') && !sentD.text.includes('core features'), 'Test D avoids software questionnaire');

  // --------------------------------------------------------------------------
  // TEST E: Investment inquiry -> Business/investment response, not project requirements
  // --------------------------------------------------------------------------
  console.log('\n[Test E] Investment inquiry -> Business/investment response');
  setGeminiMockHandler(async (params) => {
    return {
      reply: `Dear Alex,\n\nThank you for your interest in ${params.companyContext?.name}. We appreciate you reaching out from Horizon Ventures.\n\nI would be glad to connect you with our founding team to share our latest overview and schedule an introductory conversation. What is the best contact number or email for your team?`,
      options: [],
      conversationState: 'ANSWER_AND_ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Investor relations response',
      nextBestQuestion: 'Best contact for intro conversation',
      extractedRequirements: {
        clientName: 'Alex Thorne',
        companyName: 'Horizon Ventures',
        email: '',
        phone: '',
        projectType: 'Investment / Investor Relations',
        objective: 'Growth capital discussion',
        targetAudience: '',
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
  });

  const resE = await processInboundEmail(
    {
      messageId: `msg-e-${uniqueId}`,
      sender: `alex-${uniqueId}@horizonventures.com`,
      recipient: `connect-sw-${uniqueId}@apexbyte.io`,
      subject: 'Investment Inquiry from Horizon Ventures',
      text: 'Hello, Horizon Ventures is reviewing high-growth technology consulting platforms. Are you currently open to strategic growth investment discussions?',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-e-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resE.success === true, 'Test E processed successfully');
  const sentE = mockProvider.sentEmails.find((e) => e.to === `alex-${uniqueId}@horizonventures.com`);
  assert(Boolean(sentE), 'Outbound email sent for investment inquiry');
  assert(sentE.text.includes('founding team') || sentE.text.includes('Horizon Ventures'), 'Test E addresses investor');
  assert(!sentE.text.includes('budget range') && !sentE.text.includes('wireframes'), 'Test E avoids software questionnaire');

  // --------------------------------------------------------------------------
  // TEST F & G & H: Follow-up & Anti-repetition (budget, timeline)
  // --------------------------------------------------------------------------
  console.log('\n[Test F, G, H] Follow-up & Anti-repetition (budget & timeline confirmed)');
  const clientFEmail = `client-f-${uniqueId}@retailflow.com`;

  // Step 1: Client states budget and timeline
  setGeminiMockHandler(async () => {
    return {
      reply: `Hi Marcus,\n\nWe have noted your e-commerce portal project with a budget of $35,000 and target launch by November 15. What core integrations (such as Stripe or Shopify) will your platform require?`,
      options: [],
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Acknowledged project scope and parameters',
      nextBestQuestion: 'What core integrations will your platform require?',
      extractedRequirements: {
        clientName: 'Marcus',
        companyName: 'RetailFlow',
        email: clientFEmail,
        phone: '',
        projectType: 'E-commerce Portal',
        objective: 'Online B2B storefront',
        targetAudience: 'B2B wholesalers',
        features: ['Product Catalog', 'Customer Checkout'],
        techStack: ['Next.js'],
        budget: '$35,000',
        timeline: 'November 15',
        integrations: [],
        securityRequirements: [],
        constraints: [],
        missingFields: ['integrations'],
        qualificationScore: 70,
        readyForBrief: false,
      },
    };
  });

  const resF1 = await processInboundEmail(
    {
      messageId: `msg-f1-${uniqueId}`,
      sender: clientFEmail,
      recipient: `connect-sw-${uniqueId}@apexbyte.io`,
      subject: 'New B2B Storefront Project',
      text: 'Hi, we are building a new B2B e-commerce portal. Our allocated budget is $35,000 and we need it live by November 15.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-f1-${uniqueId}`,
        gmailThreadId: `thread-f-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resF1.success === true, 'Step 1 processed successfully');

  // Step 2: Client answers integrations. Validator & Gemini MUST NOT ask for budget or timeline again!
  setGeminiMockHandler(async (params) => {
    // Check that params.previousRequirements has budget and timeline
    assert(params.previousRequirements?.budget === '$35,000', 'Previous requirements preserved budget');
    assert(params.previousRequirements?.timeline === 'November 15', 'Previous requirements preserved timeline');

    return {
      reply: `Thanks Marcus,\n\nWe have noted your Stripe and NetSuite integration requirements alongside your $35,000 budget and November 15 launch target. Do you have existing user workflow diagrams or specifications for the checkout flow?`,
      options: [],
      conversationState: 'ASK_ONE_QUESTION',
      requiresReply: true,
      clientQuestionAnswered: 'Integration details captured',
      nextBestQuestion: 'Do you have existing user workflow diagrams for checkout?',
      extractedRequirements: {
        ...params.previousRequirements,
        integrations: ['Stripe', 'NetSuite ERP'],
        qualificationScore: 85,
        readyForBrief: false,
      } as any,
    };
  });

  const resF2 = await processInboundEmail(
    {
      messageId: `msg-f2-${uniqueId}`,
      sender: clientFEmail,
      recipient: `connect-sw-${uniqueId}@apexbyte.io`,
      subject: 'Re: New B2B Storefront Project',
      text: 'We need Stripe for payments and NetSuite for inventory ERP sync.',
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: `msg-f2-${uniqueId}`,
        gmailThreadId: `thread-f-${uniqueId}`,
      },
    },
    mockProvider as any
  );

  assert(resF2.success === true, 'Step 2 follow-up processed successfully');
  const sentF2 = mockProvider.sentEmails.find((e) => e.metadata?.incomingGmailMessageId === `msg-f2-${uniqueId}`);
  assert(Boolean(sentF2), 'Outbound email sent for Step 2 follow-up');

  // Verify validator confirms no repeated question
  const valCheck = validateCustomerResponse({
    reply: sentF2.text,
    clientMessage: 'We need Stripe for payments and NetSuite for inventory ERP sync.',
    history: [
      { sender: 'client', text: 'Hi, we are building a new B2B e-commerce portal. Our allocated budget is $35,000 and we need it live by November 15.' },
      { sender: 'agent', text: 'We have noted your e-commerce portal project with a budget of $35,000 and target launch by November 15.' }
    ],
    knownRequirements: { budget: '$35,000', timeline: 'November 15' },
    requiresReply: true,
  });
  assert(valCheck.isValid === true, 'Validation passes without repeated question issues');
  assert(valCheck.hasRepeatedQuestion === false, 'Validator confirms no repeated question');

  // --------------------------------------------------------------------------
  // TEST I & J: No generic "RECOMMENDED OPTIONS" or "Scope Overview"
  // --------------------------------------------------------------------------
  console.log('\n[Test I, J] Verifying total absence of legacy options & template headers');
  for (const sent of mockProvider.sentEmails) {
    assert(!sent.text.includes('RECOMMENDED OPTIONS'), 'No sent email contains RECOMMENDED OPTIONS');
    assert(!sent.text.includes('Scope Overview'), 'No sent email contains Scope Overview');
    assert(!sent.text.includes('Timeline & Availability'), 'No sent email contains Timeline & Availability');
    assert(!sent.html.includes('Recommended Options'), 'No sent email HTML contains Recommended Options');
    assert(!sent.html.includes('Project Specification Ready'), 'No sent email HTML contains Project Specification Ready banner');
  }

  // --------------------------------------------------------------------------
  // TEST K: Gemini Failure -> Safe, contextual fallback, NOT canned questionnaire
  // --------------------------------------------------------------------------
  console.log('\n[Test K] Gemini failure -> Safe, context-aware fallback');
  clearGeminiMockHandler();

  // Test fallback directly through validateAndNormalizeModelOutput(null, ...)
  const fallbackSoftware = validateAndNormalizeModelOutput(null, undefined, {
    companyId: softwareCompany.id,
    name: 'ApexByte Software',
    industry: 'Software Engineering & Cloud Architecture',
    services: ['Custom Web & Mobile Development', 'Cloud Infrastructure'],
    description: 'We build enterprise digital products.',
  });

  assert(fallbackSoftware.reply.includes('ApexByte Software'), 'Fallback mentions company name');
  assert(fallbackSoftware.reply.includes('Custom Web & Mobile Development'), 'Fallback mentions actual company services');
  assert(!fallbackSoftware.reply.includes('We would be glad to help. Could you share a bit more context on what you\'re looking to accomplish so we can provide the best guidance?'), 'Fallback does NOT use old generic sentence');
  assert(fallbackSoftware.options?.length === 0, 'Fallback options are empty array, no legacy chips');

  const fallbackConstruction = validateAndNormalizeModelOutput(null, undefined, {
    companyId: constructionCompany.id,
    name: 'Apex Construction',
    industry: 'Commercial & Residential Construction',
  });

  assert(fallbackConstruction.reply.includes('Commercial & Residential Construction'), 'Fallback mentions industry when services list is not provided');
  assert(!fallbackConstruction.reply.includes('Scope Overview'), 'Construction fallback has no Scope Overview');

  console.log('\n========================================================================');
  console.log(`  REGRESSION TEST SUITE PASSED: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');
}

runTestSuite()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
