import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma.ts';

async function main() {
  const lead = await prisma.lead.findUnique({
    where: { id: 'cmu9rzlx6000fu4lsml3ktayz' },
    include: { company: true }
  });
  console.log('LEAD:', lead);

  const conn = await prisma.automationConnection.findFirst({
    where: { companyId: lead.companyId, automationType: 'email' }
  });
  console.log('CONNECTION:', {
    id: conn?.id,
    status: conn?.status,
    displayName: conn?.displayName,
    meta: {
      ...((conn?.metadata || {})),
      // omit sensitive tokens
      tokens: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      encryptedAccessToken: undefined,
      encryptedRefreshToken: undefined,
    }
  });

  const msgs = await prisma.chatMessage.findMany({
    where: { leadId: 'cmu9rzlx6000fu4lsml3ktayz' },
    orderBy: { createdAt: 'asc' }
  });
  console.log('MESSAGES IN THIS LEAD (' + msgs.length + '):');
  msgs.forEach((m, idx) => {
    console.log(`[${idx + 1}] ${m.sender} (${m.createdAt.toISOString()}):`);
    console.log(`   Text: ${JSON.stringify(m.text)}`);
    console.log(`   ThreadId: ${m.extractedDataSnapshot?.gmailThreadId}`);
    console.log(`   MsgId: ${m.extractedDataSnapshot?.gmailMessageId}`);
    console.log(`   InReplyTo: ${m.extractedDataSnapshot?.inReplyTo}`);
    console.log(`   Subject: ${m.extractedDataSnapshot?.subject}`);
    console.log(`   Intent: ${m.extractedDataSnapshot?.intent}`);
    console.log(`   ClientQuestionAnswered: ${m.extractedDataSnapshot?.clientQuestionAnswered}`);
    console.log(`   NextBestQuestion: ${m.extractedDataSnapshot?.nextBestQuestion}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
