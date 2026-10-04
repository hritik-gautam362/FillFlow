/**
 * 20261003_phase2_persistent_ai_permissions_and_knowledge.mjs
 * 
 * Migration: 20261003_phase2_persistent_ai_permissions_and_knowledge
 * 
 * Safe additive migration for Phase 2:
 * 1. Creates CompanyAiPermission, CompanyKnowledge, CompanyAiSuggestion tables
 * 2. Establishes foreign keys and indexes
 * 3. Migrates any existing AI configuration from AutomationConnection.metadata to PostgreSQL
 * 4. Backfills default AI permissions for existing companies
 * 5. Preserves existing metadata on AutomationConnection for backward compatibility
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL);

export async function runMigration() {
  console.log('🚀 Running Migration: 20261003_phase2_persistent_ai_permissions_and_knowledge...');

  // 1. Create CompanyAiPermission table
  console.log('📦 Creating CompanyAiPermission table...');
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
  console.log('  ✅ CompanyAiPermission table created');

  // 2. Create CompanyKnowledge table
  console.log('📦 Creating CompanyKnowledge table...');
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
  console.log('  ✅ CompanyKnowledge table created');

  // 3. Create CompanyAiSuggestion table
  console.log('📦 Creating CompanyAiSuggestion table...');
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
  console.log('  ✅ CompanyAiSuggestion table created');

  // 4. Create Constraints & Indexes
  console.log('📦 Creating constraints and indexes...');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyAiPermission_companyId_key') THEN
      ALTER TABLE "CompanyAiPermission" ADD CONSTRAINT "CompanyAiPermission_companyId_key" UNIQUE ("companyId");
    END IF;
  END $$`;

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

  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiPermission_companyId_idx" ON "CompanyAiPermission"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_companyId_idx" ON "CompanyKnowledge"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_category_idx" ON "CompanyKnowledge"("category")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyKnowledge_status_idx" ON "CompanyKnowledge"("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiSuggestion_companyId_idx" ON "CompanyAiSuggestion"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyAiSuggestion_status_idx" ON "CompanyAiSuggestion"("status")`;

  console.log('  ✅ Constraints and indexes created');

  // 5. Data Migration & Backfill
  console.log('📦 Backfilling and migrating existing company data...');

  const companies = await sql`SELECT "id" FROM "Company"`;
  console.log(`  Found ${companies.length} existing companies in database`);

  for (const comp of companies) {
    const companyId = comp.id;

    // Check if CompanyAiPermission already exists
    const existingPerm = await sql`SELECT "id" FROM "CompanyAiPermission" WHERE "companyId" = ${companyId}`;
    if (existingPerm.length === 0) {
      // Check AutomationConnection for legacy metadata
      const connections = await sql`
        SELECT "metadata" FROM "AutomationConnection" 
        WHERE "companyId" = ${companyId} AND "automationType" = 'email'
        LIMIT 1
      `;

      let meta = {};
      if (connections.length > 0 && connections[0].metadata) {
        meta = typeof connections[0].metadata === 'string' 
          ? JSON.parse(connections[0].metadata) 
          : connections[0].metadata;
      }

      const storedPerms = meta.aiPermissions || {};
      const autonomyMode = meta.aiAutonomyMode || storedPerms.autonomyMode || 'LIMITED_ACCESS';
      const outboundPaused = Boolean(meta.aiOutboundPaused ?? storedPerms.outboundPaused ?? false);
      const autoReplyGeneralInfo = Boolean(storedPerms.autoReplyGeneralInfo ?? true);
      const autoReplyServices = Boolean(storedPerms.autoReplyServices ?? true);
      const autoReplyPartnerships = Boolean(storedPerms.autoReplyPartnerships ?? false);
      const autoReplyPricing = Boolean(storedPerms.autoReplyPricing ?? false);
      const autoReplyDiscounts = Boolean(storedPerms.autoReplyDiscounts ?? false);
      const autoReplyCommission = Boolean(storedPerms.autoReplyCommission ?? false);
      const autoReplyContracts = Boolean(storedPerms.autoReplyContracts ?? false);
      const autoReplyRefunds = Boolean(storedPerms.autoReplyRefunds ?? false);
      const autoReplyDeadlines = Boolean(storedPerms.autoReplyDeadlines ?? false);
      const autoReplySLAs = Boolean(storedPerms.autoReplySLAs ?? false);
      const customRestrictedKeywords = Array.isArray(storedPerms.customRestrictedKeywords) ? storedPerms.customRestrictedKeywords : [];
      const customHoldingResponseTemplate = storedPerms.customHoldingResponseTemplate || null;
      const topicPolicies = storedPerms.topicPolicies ? JSON.stringify(storedPerms.topicPolicies) : null;

      await sql`
        INSERT INTO "CompanyAiPermission" (
          "companyId",
          "autonomyMode",
          "outboundPaused",
          "autoReplyGeneralInfo",
          "autoReplyServices",
          "autoReplyPartnerships",
          "autoReplyPricing",
          "autoReplyDiscounts",
          "autoReplyCommission",
          "autoReplyContracts",
          "autoReplyRefunds",
          "autoReplyDeadlines",
          "autoReplySLAs",
          "customRestrictedKeywords",
          "customHoldingResponseTemplate",
          "topicPolicies"
        ) VALUES (
          ${companyId},
          ${autonomyMode},
          ${outboundPaused},
          ${autoReplyGeneralInfo},
          ${autoReplyServices},
          ${autoReplyPartnerships},
          ${autoReplyPricing},
          ${autoReplyDiscounts},
          ${autoReplyCommission},
          ${autoReplyContracts},
          ${autoReplyRefunds},
          ${autoReplyDeadlines},
          ${autoReplySLAs},
          ${customRestrictedKeywords},
          ${customHoldingResponseTemplate},
          ${topicPolicies ? sql`${topicPolicies}::jsonb` : null}
        )
        ON CONFLICT ("companyId") DO NOTHING
      `;

      // Migrate Knowledge from metadata if any
      const rawKnowledge = meta.aiKnowledge || storedPerms.knowledge || [];
      if (Array.isArray(rawKnowledge)) {
        for (const item of rawKnowledge) {
          if (!item.title || !item.content) continue;
          const itemId = item.id || `know_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const category = item.category || 'company';
          const verified = Boolean(item.verified);
          const status = item.status || (verified ? 'VERIFIED' : 'PENDING_REVIEW');
          const source = item.source || 'COMPANY';
          const verifiedBy = item.verifiedBy || (verified ? 'Migration Backfill' : null);
          const verifiedAt = item.verifiedAt ? new Date(item.verifiedAt) : (verified ? new Date() : null);

          await sql`
            INSERT INTO "CompanyKnowledge" (
              "id", "companyId", "category", "title", "content", "verified", "status", "source", "verifiedAt", "verifiedBy"
            ) VALUES (
              ${itemId}, ${companyId}, ${category}, ${item.title}, ${item.content}, ${verified}, ${status}, ${source}, ${verifiedAt}, ${verifiedBy}
            )
            ON CONFLICT ("id") DO NOTHING
          `;
        }
      }

      // Migrate Suggestions from metadata if any
      const rawSuggestions = storedPerms.suggestions || [];
      if (Array.isArray(rawSuggestions)) {
        for (const sug of rawSuggestions) {
          if (!sug.suggestionText) continue;
          const sugId = sug.id || `sug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const suggestedCategory = sug.suggestedCategory || 'company';
          const sourceSnippet = sug.sourceSnippet || '';
          const status = sug.status || 'PENDING';
          const detectedAt = sug.detectedAt ? new Date(sug.detectedAt) : new Date();

          await sql`
            INSERT INTO "CompanyAiSuggestion" (
              "id", "companyId", "suggestionText", "suggestedCategory", "sourceSnippet", "status", "detectedAt"
            ) VALUES (
              ${sugId}, ${companyId}, ${sug.suggestionText}, ${suggestedCategory}, ${sourceSnippet}, ${status}, ${detectedAt}
            )
            ON CONFLICT ("id") DO NOTHING
          `;
        }
      }
    }
  }

  console.log('🎉 Migration 20261003_phase2_persistent_ai_permissions_and_knowledge completed successfully!');
}

if (process.argv[1]?.endsWith('20261003_phase2_persistent_ai_permissions_and_knowledge.mjs')) {
  runMigration().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}
