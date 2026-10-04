import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, AutomationConnection, Prisma } from '@prisma/client';
import { isAutomationEnabled } from './automationAccessService';

export { ConnectionStatus };

export interface ConnectionDetails {
  automationType: AutomationType;
  status: ConnectionStatus;
  provider: string | null;
  externalId: string | null;
  displayName: string | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get or initialize the automation connection record for a company.
 */
export async function getAutomationConnection(
  companyId: string,
  automationType: AutomationType
): Promise<AutomationConnection> {
  const existing = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
  });

  if (existing) {
    return existing;
  }

  // Create default not_connected record
  return prisma.automationConnection.create({
    data: {
      companyId,
      automationType,
      status: ConnectionStatus.not_connected,
    },
  });
}

/**
 * Update or establish a connection for an active automation.
 * Rejects if the company does NOT have active access to this automation.
 */
export async function updateAutomationConnection(
  companyId: string,
  automationType: AutomationType,
  data: {
    status: ConnectionStatus;
    provider?: string | null;
    externalId?: string | null;
    displayName?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<AutomationConnection> {
  // 1. Verify Access is Active first
  const hasAccess = await isAutomationEnabled(companyId, automationType);
  if (!hasAccess) {
    throw new Error(`Cannot connect: ${automationType} automation is locked for this company.`);
  }

  const isConnected = data.status === ConnectionStatus.connected;
  const isDisconnected = data.status === ConnectionStatus.disconnected;

  return prisma.automationConnection.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
    update: {
      status: data.status,
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.externalId !== undefined && { externalId: data.externalId }),
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      ...(isConnected && { connectedAt: new Date(), disconnectedAt: null }),
      ...(isDisconnected && { disconnectedAt: new Date() }),
    },
    create: {
      companyId,
      automationType,
      status: data.status,
      provider: data.provider ?? null,
      externalId: data.externalId ?? null,
      displayName: data.displayName ?? null,
      metadata: data.metadata ?? undefined,
      connectedAt: isConnected ? new Date() : null,
      disconnectedAt: isDisconnected ? new Date() : null,
    },
  });
}

/**
 * Disconnect an automation channel.
 */
export async function disconnectAutomation(
  companyId: string,
  automationType: AutomationType
): Promise<AutomationConnection> {
  return prisma.automationConnection.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
    update: {
      status: ConnectionStatus.disconnected,
      disconnectedAt: new Date(),
    },
    create: {
      companyId,
      automationType,
      status: ConnectionStatus.disconnected,
      disconnectedAt: new Date(),
    },
  });
}

/**
 * Get the connection statuses of all platform automations for a company.
 */
export async function getCompanyConnections(companyId: string): Promise<AutomationConnection[]> {
  const connections = await prisma.automationConnection.findMany({
    where: { companyId },
  });

  const connectionMap = new Map<AutomationType, AutomationConnection>();
  for (const c of connections) {
    connectionMap.set(c.automationType, c);
  }

  const allTypes = [AutomationType.web, AutomationType.whatsapp, AutomationType.email];
  const results: AutomationConnection[] = [];

  for (const type of allTypes) {
    const existing = connectionMap.get(type);
    if (existing) {
      results.push(existing);
    } else {
      // Lazy return default not_connected representation
      results.push({
        id: `virtual-${companyId}-${type}`,
        companyId,
        automationType: type,
        status: ConnectionStatus.not_connected,
        provider: null,
        externalId: null,
        displayName: null,
        metadata: null,
        connectedAt: null,
        disconnectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return results;
}
