import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL);

async function seed() {
  console.log('🌱 Checking seed data via Neon driver...');

  // 1. Ensure Demo Workspace exists
  const companies = await sql`SELECT id, name FROM "Company" WHERE name = 'ApexByte Demo Workspace' LIMIT 1`;
  let demoCompanyId;

  if (companies.length === 0) {
    const inserted = await sql`
      INSERT INTO "Company" (id, name, industry, "teamSize", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'ApexByte Demo Workspace', 'Software Consulting', '10-50', NOW(), NOW())
      RETURNING id
    `;
    demoCompanyId = inserted[0].id;
    console.log('  Created Demo Workspace:', demoCompanyId);
  } else {
    demoCompanyId = companies[0].id;
    console.log('  Demo Workspace found:', demoCompanyId);
  }

  // Ensure default automations for Demo Workspace
  for (const type of ['web', 'whatsapp', 'email']) {
    const isWeb = type === 'web';
    await sql`
      INSERT INTO "AutomationAccess" (id, "companyId", "automationType", enabled, "activatedAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${demoCompanyId}, ${type}::"AutomationType", ${isWeb}, ${isWeb ? new Date() : null}, NOW(), NOW())
      ON CONFLICT ("companyId", "automationType") DO NOTHING
    `;
  }

  // 2. Ensure Demo Company Admin User exists
  const demoUserEmail = 'demo@apexbyte.io';
  const existingUsers = await sql`SELECT id, email FROM "User" WHERE email = ${demoUserEmail} LIMIT 1`;

  if (existingUsers.length === 0) {
    const pwHash = await bcrypt.hash('ApexDemo2026!', 10);
    const insertedUser = await sql`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "companyId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'Demo Admin', ${demoUserEmail}, ${pwHash}, 'company_admin'::"UserRole", ${demoCompanyId}, NOW(), NOW())
      RETURNING id, email
    `;
    console.log('  Created Demo User:', insertedUser[0].email);
  } else {
    console.log('  Demo User exists:', existingUsers[0].email);
  }

  // 3. Ensure Platform Admin User exists
  const adminEmail = 'admin@apexbyte.io';
  const existingAdmins = await sql`SELECT id, email FROM "User" WHERE email = ${adminEmail} LIMIT 1`;

  if (existingAdmins.length === 0) {
    const pwHash = await bcrypt.hash('ApexPlatformAdmin2026!', 10);
    const insertedAdmin = await sql`
      INSERT INTO "User" (id, name, email, "passwordHash", role, "companyId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'Platform Administrator', ${adminEmail}, ${pwHash}, 'platform_admin'::"UserRole", ${demoCompanyId}, NOW(), NOW())
      RETURNING id, email
    `;
    console.log('  Created Platform Admin:', insertedAdmin[0].email);
  } else {
    console.log('  Platform Admin exists:', existingAdmins[0].email);
  }

  console.log('✅ Seed completed successfully!');
}

seed().catch((e) => {
  console.error('❌ Seed error:', e);
  process.exit(1);
});
