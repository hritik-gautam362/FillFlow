/**
 * 20261003_phase4_guided_onboarding_state.mjs
 * 
 * Migration: 20261003_phase4_guided_onboarding_state
 * 
 * Safe additive migration for Phase 4:
 * 1. Adds onboardingCompleted, onboardingStep, onboardingCompletedAt to Company table.
 * 2. Backfills all existing companies to onboardingCompleted = true, onboardingCompletedAt = CURRENT_TIMESTAMP
 *    so existing users are NEVER forced into onboarding.
 * 3. Newly created companies will have onboardingCompleted = false, onboardingStep = 1.
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
  return pool.query(strings.join(' '), values);
}

export async function runMigration() {
  console.log('🚀 Running Migration: 20261003_phase4_guided_onboarding_state...');

  // 1. Add onboarding columns to Company table
  console.log('📦 Updating Company table with onboarding fields...');
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3)`;
  console.log('  ✅ Company table onboarding columns added');

  // 2. Mark existing companies as onboardingCompleted = true
  console.log('📦 Backfilling existing companies: onboardingCompleted = true...');
  const result = await pool.query(
    'UPDATE "Company" SET "onboardingCompleted" = true, "onboardingCompletedAt" = COALESCE("onboardingCompletedAt", CURRENT_TIMESTAMP) WHERE "onboardingCompleted" = false'
  );
  console.log(`  ✅ Backfilled ${result.rowCount || 0} existing companies as onboardingCompleted = true`);

  console.log('🎉 Migration completed successfully!');
}

runMigration()
  .then(() => pool.end())
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    pool.end();
    process.exit(1);
  });
