/**
 * push-schema.mjs
 * 
 * Creates all database tables defined in the Prisma schema using the
 * @neondatabase/serverless driver directly.
 * 
 * This bypasses Prisma CLI's Rust-based query engine which has TLS
 * handshake issues on Windows when connecting to Neon on port 443.
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL);

async function pushSchema() {
  console.log('🔌 Connecting to Neon PostgreSQL...');

  // Test connection
  const result = await sql`SELECT version()`;
  console.log('✅ Connected:', result[0].version.split(',')[0]);

  console.log('\n📦 Creating enums...');

  // Create enums (IF NOT EXISTS)
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelSource') THEN
      CREATE TYPE "ChannelSource" AS ENUM ('whatsapp', 'web_chat', 'contact_form', 'email');
    ELSE
      ALTER TYPE "ChannelSource" ADD VALUE IF NOT EXISTS 'email';
    END IF;
  END $$`;
  console.log('  ✅ ChannelSource');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStatus') THEN
      CREATE TYPE "LeadStatus" AS ENUM ('new', 'qualifying', 'qualified', 'disqualified', 'brief_ready', 'converted');
    END IF;
  END $$`;
  console.log('  ✅ LeadStatus');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Complexity') THEN
      CREATE TYPE "Complexity" AS ENUM ('Low', 'Medium', 'High');
    END IF;
  END $$`;
  console.log('  ✅ Complexity');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageSender') THEN
      CREATE TYPE "MessageSender" AS ENUM ('client', 'agent', 'system');
    END IF;
  END $$`;
  console.log('  ✅ MessageSender');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutomationType') THEN
      CREATE TYPE "AutomationType" AS ENUM ('web', 'whatsapp', 'email');
    END IF;
  END $$`;
  console.log('  ✅ AutomationType');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
      CREATE TYPE "UserRole" AS ENUM ('company_user', 'company_admin', 'platform_admin');
    END IF;
  END $$`;
  console.log('  ✅ UserRole');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConnectionStatus') THEN
      CREATE TYPE "ConnectionStatus" AS ENUM ('not_connected', 'pending', 'connected', 'disconnected', 'error');
    END IF;
  END $$`;
  console.log('  ✅ ConnectionStatus');

  console.log('\n📦 Creating tables...');

  // Company table
  await sql`CREATE TABLE IF NOT EXISTS "Company" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"      TEXT NOT NULL,
    "logo"      TEXT,
    "industry"  TEXT,
    "teamSize"  TEXT,
    "website"   TEXT,
    "phone"     TEXT,
    "address"   TEXT,
    "city"      TEXT,
    "state"     TEXT,
    "country"   TEXT,
    "timezone"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
  )`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "address" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "state" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "country" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "timezone" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3)`;
  console.log('  ✅ Company');

  // User table
  await sql`CREATE TABLE IF NOT EXISTS "User" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"         TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role"         "UserRole" NOT NULL DEFAULT 'company_admin',
    "companyId"    TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ User');

  // AutomationConnection table
  await sql`CREATE TABLE IF NOT EXISTS "AutomationConnection" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"      TEXT NOT NULL,
    "automationType" "AutomationType" NOT NULL,
    "status"         "ConnectionStatus" NOT NULL DEFAULT 'not_connected',
    "provider"       TEXT,
    "externalId"     TEXT,
    "displayName"    TEXT,
    "metadata"       JSONB,
    "connectedAt"    TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationConnection_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ AutomationConnection');

  // Lead table
  await sql`CREATE TABLE IF NOT EXISTS "Lead" (
    "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"          TEXT NOT NULL,
    "clientName"         TEXT NOT NULL,
    "companyName"        TEXT NOT NULL,
    "email"              TEXT NOT NULL,
    "phone"              TEXT NOT NULL,
    "channel"            "ChannelSource" NOT NULL DEFAULT 'web_chat',
    "status"             "LeadStatus" NOT NULL DEFAULT 'new',
    "qualificationScore" INTEGER NOT NULL DEFAULT 0,
    "estimatedBudget"    TEXT,
    "requestedTimeline"  TEXT,
    "projectType"        TEXT,
    "assignedManager"    TEXT,
    "notes"              TEXT,
    "lastActive"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ Lead');

  // ProjectBrief table
  await sql`CREATE TABLE IF NOT EXISTS "ProjectBrief" (
    "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "leadId"                TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "summary"               TEXT NOT NULL,
    "projectType"           TEXT NOT NULL,
    "targetAudience"        TEXT NOT NULL,
    "requiredTechStack"     TEXT[] NOT NULL,
    "budgetRange"           TEXT NOT NULL,
    "estimatedDuration"     TEXT NOT NULL,
    "keyRisks"              TEXT[] NOT NULL,
    "rawConversationLength" INTEGER NOT NULL DEFAULT 0,
    "structuredJson"        JSONB NOT NULL,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ ProjectBrief');

  // ProjectFeature table
  await sql`CREATE TABLE IF NOT EXISTS "ProjectFeature" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "briefId"     TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "complexity"  "Complexity" NOT NULL DEFAULT 'Medium',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectFeature_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ ProjectFeature');

  // ChatMessage table
  await sql`CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "leadId"                TEXT NOT NULL,
    "sender"                "MessageSender" NOT NULL,
    "text"                  TEXT NOT NULL,
    "options"               TEXT[] NOT NULL,
    "extractedDataSnapshot" JSONB,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ ChatMessage');

  // AutomationAccess table
  await sql`CREATE TABLE IF NOT EXISTS "AutomationAccess" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"        TEXT NOT NULL,
    "automationType"   "AutomationType" NOT NULL,
    "enabled"          BOOLEAN NOT NULL DEFAULT false,
    "activatedAt"      TIMESTAMP(3),
    "expiresAt"        TIMESTAMP(3),
    "monthlyLimit"     INTEGER NOT NULL DEFAULT 100,
    "usedCredits"      INTEGER NOT NULL DEFAULT 0,
    "reservedCredits"  INTEGER NOT NULL DEFAULT 0,
    "quotaLocked"      BOOLEAN NOT NULL DEFAULT false,
    "adminDisabled"    BOOLEAN NOT NULL DEFAULT false,
    "quotaPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextResetAt"      TIMESTAMP(3),
    "lastResetAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationAccess_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ AutomationAccess');

  // Alter AutomationAccess in case it already exists
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "monthlyLimit" INTEGER NOT NULL DEFAULT 100`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "usedCredits" INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "reservedCredits" INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "quotaLocked" BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "adminDisabled" BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "quotaPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "nextResetAt" TIMESTAMP(3)`;
  await sql`ALTER TABLE "AutomationAccess" ADD COLUMN IF NOT EXISTS "lastResetAt" TIMESTAMP(3)`;

  // AutomationQuotaAuditLog table
  await sql`CREATE TABLE IF NOT EXISTS "AutomationQuotaAuditLog" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"      TEXT NOT NULL,
    "automationType" "AutomationType" NOT NULL DEFAULT 'email',
    "action"         TEXT NOT NULL,
    "details"        JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationQuotaAuditLog_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ AutomationQuotaAuditLog');

  // CompanyAiPermission table
  await sql`CREATE TABLE IF NOT EXISTS "CompanyAiPermission" (
    "id"                            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"                     TEXT NOT NULL,
    "autonomyMode"                  TEXT NOT NULL DEFAULT 'LIMITED_ACCESS',
    "outboundPaused"                BOOLEAN NOT NULL DEFAULT false,
    "autoReplyGeneralInfo"          BOOLEAN NOT NULL DEFAULT true,
    "autoReplyServices"             BOOLEAN NOT NULL DEFAULT true,
    "autoReplyPartnerships"         BOOLEAN NOT NULL DEFAULT false,
    "autoReplyPricing"              BOOLEAN NOT NULL DEFAULT false,
    "autoReplyDiscounts"            BOOLEAN NOT NULL DEFAULT false,
    "autoReplyCommission"           BOOLEAN NOT NULL DEFAULT false,
    "autoReplyContracts"            BOOLEAN NOT NULL DEFAULT false,
    "autoReplyRefunds"              BOOLEAN NOT NULL DEFAULT false,
    "autoReplyDeadlines"            BOOLEAN NOT NULL DEFAULT false,
    "autoReplySLAs"                 BOOLEAN NOT NULL DEFAULT false,
    "customRestrictedKeywords"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "customHoldingResponseTemplate" TEXT,
    "topicPolicies"                 JSONB,
    "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyAiPermission_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ CompanyAiPermission');

  // CompanyKnowledge table
  await sql`CREATE TABLE IF NOT EXISTS "CompanyKnowledge" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"  TEXT NOT NULL,
    "category"   TEXT NOT NULL DEFAULT 'company',
    "title"      TEXT NOT NULL,
    "content"    TEXT NOT NULL,
    "verified"   BOOLEAN NOT NULL DEFAULT false,
    "status"     TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "source"     TEXT NOT NULL DEFAULT 'COMPANY',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyKnowledge_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ CompanyKnowledge');

  // CompanyAiSuggestion table
  await sql`CREATE TABLE IF NOT EXISTS "CompanyAiSuggestion" (
    "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"         TEXT NOT NULL,
    "suggestionText"    TEXT NOT NULL,
    "suggestedCategory" TEXT NOT NULL,
    "sourceSnippet"     TEXT NOT NULL,
    "detectedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyAiSuggestion_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ CompanyAiSuggestion');

  // CompanyCommunicationSettings table
  await sql`CREATE TABLE IF NOT EXISTS "CompanyCommunicationSettings" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId"        TEXT NOT NULL,
    "tone"             TEXT NOT NULL DEFAULT 'professional',
    "responseDelay"    TEXT NOT NULL DEFAULT 'immediate',
    "signature"        TEXT,
    "signatureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyCommunicationSettings_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ CompanyCommunicationSettings');

  // BusinessHours table
  await sql`CREATE TABLE IF NOT EXISTS "BusinessHours" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId" TEXT NOT NULL,
    "timezone"  TEXT,
    "schedule"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ BusinessHours');

  console.log('\n📦 Creating indexes and constraints...');

  // Unique constraint on User.email
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_email_key') THEN
      ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
    END IF;
  END $$`;

  // Foreign key on User.companyId
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_fkey') THEN
      ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  // Unique constraint on AutomationConnection (companyId, automationType)
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationConnection_companyId_automationType_key') THEN
      ALTER TABLE "AutomationConnection" ADD CONSTRAINT "AutomationConnection_companyId_automationType_key" UNIQUE ("companyId", "automationType");
    END IF;
  END $$`;

  // Foreign key on AutomationConnection.companyId
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationConnection_companyId_fkey') THEN
      ALTER TABLE "AutomationConnection" ADD CONSTRAINT "AutomationConnection_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  // Unique constraint on ProjectBrief.leadId
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectBrief_leadId_key') THEN
      ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_leadId_key" UNIQUE ("leadId");
    END IF;
  END $$`;

  // Foreign keys
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_companyId_fkey') THEN
      ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectBrief_leadId_fkey') THEN
      ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_leadId_fkey"
        FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectFeature_briefId_fkey') THEN
      ALTER TABLE "ProjectFeature" ADD CONSTRAINT "ProjectFeature_briefId_fkey"
        FOREIGN KEY ("briefId") REFERENCES "ProjectBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_leadId_fkey') THEN
      ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_leadId_fkey"
        FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationAccess_companyId_fkey') THEN
      ALTER TABLE "AutomationAccess" ADD CONSTRAINT "AutomationAccess_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutomationQuotaAuditLog_companyId_fkey') THEN
      ALTER TABLE "AutomationQuotaAuditLog" ADD CONSTRAINT "AutomationQuotaAuditLog_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  // Unique constraint on CompanyAiPermission.companyId
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyAiPermission_companyId_key') THEN
      ALTER TABLE "CompanyAiPermission" ADD CONSTRAINT "CompanyAiPermission_companyId_key" UNIQUE ("companyId");
    END IF;
  END $$`;

  // Foreign keys for AI tables
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyAiPermission_companyId_fkey') THEN
      ALTER TABLE "CompanyAiPermission" ADD CONSTRAINT "CompanyAiPermission_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyKnowledge_companyId_fkey') THEN
      ALTER TABLE "CompanyKnowledge" ADD CONSTRAINT "CompanyKnowledge_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyAiSuggestion_companyId_fkey') THEN
      ALTER TABLE "CompanyAiSuggestion" ADD CONSTRAINT "CompanyAiSuggestion_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyCommunicationSettings_companyId_fkey') THEN
      ALTER TABLE "CompanyCommunicationSettings" ADD CONSTRAINT "CompanyCommunicationSettings_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessHours_companyId_fkey') THEN
      ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationConnection_companyId_idx" ON "AutomationConnection"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationConnection_status_idx" ON "AutomationConnection"("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "Lead_companyId_idx" ON "Lead"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "ProjectBrief_leadId_idx" ON "ProjectBrief"("leadId")`;
  await sql`CREATE INDEX IF NOT EXISTS "ProjectFeature_briefId_idx" ON "ProjectFeature"("briefId")`;
  await sql`CREATE INDEX IF NOT EXISTS "ChatMessage_leadId_idx" ON "ChatMessage"("leadId")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "AutomationAccess_companyId_automationType_key" ON "AutomationAccess"("companyId", "automationType")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationAccess_companyId_idx" ON "AutomationAccess"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationQuotaAuditLog_companyId_idx" ON "AutomationQuotaAuditLog"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationQuotaAuditLog_action_idx" ON "AutomationQuotaAuditLog"("action")`;
  await sql`CREATE INDEX IF NOT EXISTS "AutomationQuotaAuditLog_createdAt_idx" ON "AutomationQuotaAuditLog"("createdAt")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiPermission_companyId_idx" ON "CompanyAiPermission"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_companyId_idx" ON "CompanyKnowledge"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_category_idx" ON "CompanyKnowledge"("category")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_status_idx" ON "CompanyKnowledge"("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiSuggestion_companyId_idx" ON "CompanyAiSuggestion"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiSuggestion_status_idx" ON "CompanyAiSuggestion"("status")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyCommunicationSettings_companyId_key" ON "CompanyCommunicationSettings"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyCommunicationSettings_companyId_idx" ON "CompanyCommunicationSettings"("companyId")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "BusinessHours_companyId_key" ON "BusinessHours"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "BusinessHours_companyId_idx" ON "BusinessHours"("companyId")`;

  console.log('  ✅ All indexes and foreign keys created');

  // Verify tables
  console.log('\n📊 Verifying tables...');
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  console.log('  Tables found:', tables.map(t => t.table_name).join(', '));

  // Verify enums
  const enums = await sql`
    SELECT typname 
    FROM pg_type 
    WHERE typname IN ('ChannelSource', 'LeadStatus', 'Complexity', 'MessageSender', 'AutomationType', 'UserRole', 'ConnectionStatus')
    ORDER BY typname
  `;
  console.log('  Enums found:', enums.map(e => e.typname).join(', '));

  console.log('\n🎉 Database schema pushed successfully!');
}

pushSchema().catch((err) => {
  console.error('❌ Schema push failed:', err.message);
  process.exit(1);
});
