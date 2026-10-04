import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

let connectionString = process.env.DATABASE_URL || '';
if (connectionString.includes(':443')) {
  connectionString = connectionString.replace(':443/', ':5432/').replace(':443?', ':5432?');
}

const prisma = new PrismaClient({
  datasources: connectionString ? { db: { url: connectionString } } : undefined,
});

// Specifically identified test records created during the stress test suite and pings
const TEST_LEAD_IDS = [
  'cmtpf0dz00002u46ccqfqnr0r', // First ping test
  'cmtpfprtt0001u4dgvokd8jtl', // Second ping test
  'cmtpgygwe000mu4i4cprqw5ap', // Pre-stress ping
  'cmtph21dl000su4i4tdhqi3ft', // Failed test run 1
  'cmtph30rv000yu4i4oifwwaom', // Scenario 1 (Very vague client)
  'cmtph39iq0014u4i431xdoxkc', // Scenario 2 (Incomplete project)
  'cmtph47ra001au4i4li7amcbv', // Scenario 3 (Requirement pivot)
  'cmtph4omt001ku4i4ahco0562', // Scenario 4 (Uncertain information)
  'cmtph4ygo001qu4i40wcebuow', // Scenario 5 (FleetPulse all at once)
  'cmtph5e940022u4i4guns9taa', // Scenario 6 (Prompt injection)
  'cmtph9pf00028u4i44nnpr4pu', // Telemedicine browser test
];

async function cleanup() {
  console.log('🧹 Cleaning up identified stress-test records...');

  for (const id of TEST_LEAD_IDS) {
    try {
      const deleted = await prisma.lead.delete({
        where: { id },
      });
      console.log(`  - Deleted test lead: ${id} (${deleted.clientName} / ${deleted.email})`);
    } catch (err) {
      console.log(`  - Lead ${id} not found or already deleted.`);
    }
  }

  const remainingLeads = await prisma.lead.findMany({
    select: {
      id: true,
      clientName: true,
      companyName: true,
      email: true,
      status: true,
      qualificationScore: true,
    },
  });

  console.log('\n✅ Cleanup complete. Remaining production/demo leads:');
  console.log(JSON.stringify(remainingLeads, null, 2));

  await prisma.$disconnect();
}

cleanup().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
