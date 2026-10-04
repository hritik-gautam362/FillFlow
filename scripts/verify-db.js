const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { PrismaClient } = require('@prisma/client');

// Read .env file manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);
const connectionString = dbUrlMatch ? dbUrlMatch[1] : null;

async function main() {
  console.log('Testing Prisma Client with Neon Adapter...');
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const rawResult = await prisma.$queryRaw`SELECT current_database(), version();`;
    console.log('✓ Prisma Raw Query Success:', rawResult);

    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `;
    console.log('✓ Verified Neon Database Tables via Prisma Client:', tables.map(t => t.table_name));
  } catch (err) {
    console.error('Prisma connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
