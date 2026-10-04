import { PrismaClient } from '@prisma/client';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';

// Always use 'ws' in Node.js environment to prevent Node 22 experimental WebSocket socket drops
neonConfig.webSocketConstructor = ws;


function buildConnectionString(): string {
  const connectionString = process.env.DATABASE_URL || '';
  if (!connectionString) return '';

  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '5');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '30');
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '15');
    }
    if (!url.searchParams.has('max_idle_connection_lifetime')) {
      url.searchParams.set('max_idle_connection_lifetime', '15');
    }
    return url.toString();
  } catch {
    const separator = connectionString.includes('?') ? '&' : '?';
    return `${connectionString}${separator}connection_limit=5&pool_timeout=30&connect_timeout=15&max_idle_connection_lifetime=15`;
  }
}

function createPrismaClient(): PrismaClient {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (err: Error) => {
    console.warn('Neon connection pool warning:', err.message);
  });
  const adapter = new PrismaNeon(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function getPrismaClient(): PrismaClient {
  return prisma;
}

export default prisma;
