import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

dotenv.config();

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

import { prisma } from '../src/lib/prisma.ts';
import { AutomationType, ConnectionStatus } from '@prisma/client';
import { GoogleProvider } from '../src/lib/services/email/GoogleProvider.ts';
import { processInboundEmail } from '../src/lib/services/email/emailInboundService.ts';

async function main() {
  console.log('--- REPRODUCING BATCH PROCESSING BEHAVIOR ---');
  const testId = Date.now();
  const testCompanyId = `test-batch-${testId}`;

  const company = await prisma.company.create({
    data: {
      id: testCompanyId,
      name: `Batch Test Co ${testId}`,
    },
  });

  const connectedEmail = `workspace-${testId}@example.com`;

  await prisma.automationConnection.create({
    data: {
      companyId: testCompanyId,
      automationType: AutomationType.email,
      provider: 'google',
      status: ConnectionStatus.connected,
      displayName: connectedEmail,
      metadata: {
        googleEmail: connectedEmail,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
      },
    },
  });

  await prisma.automationAccess.create({
    data: {
      companyId: testCompanyId,
      automationType: AutomationType.email,
      enabled: true,
      monthlyLimit: 100,
      usedCredits: 2,
      reservedCredits: 0,
      quotaLocked: false,
      adminDisabled: false,
    },
  });

  const provider = new GoogleProvider({
    companyId: testCompanyId,
    accessToken: 'sim-test-token',
    refreshToken: 'sim-test-refresh',
    connectedEmail,
    simulated: true,
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
  });

  const messages = [
    {
      id: `msg-${testId}-A`,
      threadId: `thread-${testId}-A`,
      sender: `alice-${testId}@example.com`,
      subject: 'Inquiry: what services do you provide?',
      text: 'Hi, what services do you provide?',
    },
    {
      id: `msg-${testId}-B`,
      threadId: `thread-${testId}-B`,
      sender: `bob-${testId}@example.com`,
      subject: 'Partnership with your company',
      text: "Hi, we'd like to discuss a partnership with your company.",
    },
    {
      id: `msg-${testId}-C`,
      threadId: `thread-${testId}-C`,
      sender: `charlie-${testId}@example.com`,
      subject: 'Quotation for services',
      text: "Hi, I'm interested in getting a quotation for your services.",
    },
  ];

  const results = [];

  for (const m of messages) {
    console.log(`\nProcessing Message: ${m.id} from ${m.sender}`);
    const parsed = {
      messageId: m.id,
      sender: m.sender,
      recipient: connectedEmail,
      subject: m.subject,
      text: m.text,
      timestamp: Date.now(),
      metadata: {
        gmailMessageId: m.id,
        gmailThreadId: m.threadId,
      },
    };

    try {
      const res = await processInboundEmail(parsed, provider);
      console.log(`Result for ${m.id}:`, {
        status: res.status,
        classification: res.classification,
        replySent: res.replySent,
        error: res.errorMessage || res.errorCategory,
      });
      results.push({ id: m.id, res });
    } catch (err) {
      console.error(`Error processing ${m.id}:`, err);
      results.push({ id: m.id, error: err.message });
    }

    const access = await prisma.automationAccess.findFirst({
      where: { companyId: testCompanyId, automationType: AutomationType.email },
    });
    console.log(`Quota State after ${m.id}: used=${access.usedCredits}, reserved=${access.reservedCredits}, locked=${access.quotaLocked}`);
  }

  console.log('\nFINAL SUMMARY:');
  for (const r of results) {
    console.log(`- ${r.id}: replySent=${r.res?.replySent}, status=${r.res?.status}`);
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
