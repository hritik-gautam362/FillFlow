import dotenv from 'dotenv';
dotenv.config();
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}
import { prisma } from '../src/lib/prisma.ts';

async function check() {
  const msgs = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('LATEST 10 CHAT MESSAGES:');
  for (const m of msgs.reverse()) {
    console.log('--- MSG ID:', m.id, 'LEAD:', m.leadId, 'SENDER:', m.sender, 'TIME:', m.createdAt);
    console.log('TEXT:', m.text);
    console.log('SNAPSHOT:', JSON.stringify(m.extractedDataSnapshot, null, 2));
  }
}
check().finally(() => prisma.$disconnect());
