import { prisma } from '../src/lib/prisma';

async function main() {
  const ids = ['1a173da58164463b', '1a173dd6e46cd6b5'];
  for (const id of ids) {
    const msgs = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { extractedDataSnapshot: { path: ['gmailMessageId'], equals: id } },
          { extractedDataSnapshot: { path: ['emailMessageId'], equals: id } },
        ]
      }
    });
    console.log(`\n=================== ID: ${id} ===================`);
    for (const m of msgs) {
      console.log(`Subject: ${(m.extractedDataSnapshot as any)?.subject}`);
      console.log(`Sender: ${(m.extractedDataSnapshot as any)?.sender}`);
      console.log(`Text:\n${m.text}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
