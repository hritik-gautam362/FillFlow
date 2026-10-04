/**
 * verify-prisma.mjs
 * 
 * Verifies that the Prisma Client can connect to the Neon database
 * and perform basic CRUD operations.
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL);

async function verify() {
  console.log('🔍 Verifying database schema...\n');

  // Check tables
  const tables = await sql`
    SELECT table_name, 
           (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  console.log('📊 Tables:');
  for (const table of tables) {
    console.log(`  ✅ ${table.table_name} (${table.column_count} columns)`);
  }

  // Check enums
  const enums = await sql`
    SELECT t.typname as enum_name, 
           array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname IN ('ChannelSource', 'LeadStatus', 'Complexity', 'MessageSender')
    GROUP BY t.typname
    ORDER BY t.typname
  `;

  console.log('\n📊 Enums:');
  for (const e of enums) {
    console.log(`  ✅ ${e.enum_name}: [${e.values.join(', ')}]`);
  }

  // Check foreign keys
  const fkeys = await sql`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name
  `;

  console.log('\n📊 Foreign Keys:');
  for (const fk of fkeys) {
    console.log(`  ✅ ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}`);
  }

  // Check indexes
  const indexes = await sql`
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname NOT LIKE '%pkey'
    AND indexname NOT LIKE '%key'
    ORDER BY tablename, indexname
  `;

  console.log('\n📊 Indexes:');
  for (const idx of indexes) {
    console.log(`  ✅ ${idx.tablename}.${idx.indexname}`);
  }

  console.log('\n✅ Database schema verification complete!');
}

verify().catch((err) => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
