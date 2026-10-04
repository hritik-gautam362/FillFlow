const { Pool } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

const ddl = `
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelSource') THEN 
    CREATE TYPE "ChannelSource" AS ENUM ('whatsapp', 'web_chat', 'contact_form'); 
  END IF; 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStatus') THEN 
    CREATE TYPE "LeadStatus" AS ENUM ('new', 'qualifying', 'qualified', 'disqualified', 'brief_ready', 'converted'); 
  END IF; 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Complexity') THEN 
    CREATE TYPE "Complexity" AS ENUM ('Low', 'Medium', 'High'); 
  END IF; 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageSender') THEN 
    CREATE TYPE "MessageSender" AS ENUM ('client', 'agent', 'system'); 
  END IF; 
END $$;

CREATE TABLE IF NOT EXISTS "Company" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "logo" TEXT,
  "industry" TEXT,
  "teamSize" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
  "clientName" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "channel" "ChannelSource" NOT NULL DEFAULT 'web_chat',
  "status" "LeadStatus" NOT NULL DEFAULT 'new',
  "qualificationScore" INTEGER NOT NULL DEFAULT 0,
  "estimatedBudget" TEXT,
  "requestedTimeline" TEXT,
  "projectType" TEXT,
  "assignedManager" TEXT,
  "notes" TEXT,
  "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ProjectBrief" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL UNIQUE REFERENCES "Lead"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "targetAudience" TEXT NOT NULL,
  "requiredTechStack" TEXT[],
  "budgetRange" TEXT NOT NULL,
  "estimatedDuration" TEXT NOT NULL,
  "keyRisks" TEXT[],
  "rawConversationLength" INTEGER NOT NULL DEFAULT 0,
  "structuredJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ProjectFeature" (
  "id" TEXT PRIMARY KEY,
  "briefId" TEXT NOT NULL REFERENCES "ProjectBrief"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "complexity" "Complexity" NOT NULL DEFAULT 'Medium',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "sender" "MessageSender" NOT NULL,
  "text" TEXT NOT NULL,
  "options" TEXT[],
  "extractedDataSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Lead_companyId_idx" ON "Lead"("companyId");
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "ProjectBrief_leadId_idx" ON "ProjectBrief"("leadId");
CREATE INDEX IF NOT EXISTS "ProjectFeature_briefId_idx" ON "ProjectFeature"("briefId");
CREATE INDEX IF NOT EXISTS "ChatMessage_leadId_idx" ON "ChatMessage"("leadId");
`;

async function run() {
  console.log('Connecting to Neon PostgreSQL database...');
  try {
    await pool.query(ddl);
    console.log('✓ DDL Migration applied successfully to Neon Database!');
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    console.log('Verified Database Tables in Neon:', res.rows.map((r) => r.table_name));
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

run();
