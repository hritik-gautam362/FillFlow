/**
 * 20261003_phase3_company_profile_and_communication_settings.mjs
 * 
 * Migration: 20261003_phase3_company_profile_and_communication_settings
 * 
 * Safe additive migration for Phase 3:
 * 1. Adds website, phone, address, city, state, country, timezone to Company table.
 * 2. Creates CompanyCommunicationSettings table.
 * 3. Creates BusinessHours table.
 * 4. Adds foreign keys, unique constraints, and indexes.
 * 5. Preserves all existing company profiles, permissions, and knowledge.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { config } from 'dotenv';

config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function sql(strings, ...values) {
  const text = strings.reduce((prev, curr, i) => prev + '$' + i + curr);
  // Simpler raw query execution:
  return pool.query(strings.join(' '), values);
}

export async function runMigration() {
  console.log('🚀 Running Migration: 20261003_phase3_company_profile_and_communication_settings...');

  // 1. Add profile columns to Company table (all nullable to preserve existing data)
  console.log('📦 Updating Company table with new profile fields...');
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "address" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "state" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "country" TEXT`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "timezone" TEXT`;
  console.log('  ✅ Company table columns updated');

  // 2. Create CompanyCommunicationSettings table
  console.log('📦 Creating CompanyCommunicationSettings table...');
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
  console.log('  ✅ CompanyCommunicationSettings table created');

  // 3. Create BusinessHours table
  console.log('📦 Creating BusinessHours table...');
  await sql`CREATE TABLE IF NOT EXISTS "BusinessHours" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "companyId" TEXT NOT NULL,
    "timezone"  TEXT,
    "schedule"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
  )`;
  console.log('  ✅ BusinessHours table created');

  // 4. Foreign Keys
  console.log('📦 Establishing foreign keys...');
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
  console.log('  ✅ Foreign keys established');

  // 5. Unique Indexes & Single-column Indexes
  console.log('📦 Creating indexes and unique constraints...');
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyCommunicationSettings_companyId_key" ON "CompanyCommunicationSettings"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "CompanyCommunicationSettings_companyId_idx" ON "CompanyCommunicationSettings"("companyId")`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "BusinessHours_companyId_key" ON "BusinessHours"("companyId")`;
  await sql`CREATE INDEX IF NOT EXISTS "BusinessHours_companyId_idx" ON "BusinessHours"("companyId")`;
  console.log('  ✅ Indexes and unique constraints created');

  console.log('🎉 Migration 20261003_phase3_company_profile_and_communication_settings completed successfully!\n');
  await pool.end();
}

// Auto-run if executed directly
runMigration().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
