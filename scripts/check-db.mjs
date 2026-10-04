import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma.ts';

async function main() {
  const companies = await prisma.company.findMany();
  console.log('COMPANIES:', companies.map(c => ({ id: c.id, name: c.name, industry: c.industry })));

  const connections = await prisma.automationConnection.findMany();
  console.log('CONNECTIONS:', connections.map(cn => ({ id: cn.id, companyId: cn.companyId, type: cn.automationType, status: cn.status, displayName: cn.displayName })));

  const leads = await prisma.lead.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log('RECENT LEADS:', leads);

  const msgs = await prisma.chatMessage.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
  console.log('RECENT CHAT MESSAGES:', JSON.stringify(msgs.map(m => ({
    id: m.id,
    leadId: m.leadId,
    sender: m.sender,
    text: m.text,
    createdAt: m.createdAt,
    snapshot: m.extractedDataSnapshot
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
