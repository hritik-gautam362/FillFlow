import { prisma } from '@/lib/prisma';
import { AutomationType, AutomationAccess } from '@prisma/client';

export { AutomationType };

export interface CompanyAutomationStatus {
  automationType: AutomationType;
  enabled: boolean;
  activatedAt: Date | null;
  expiresAt: Date | null;
}

export interface AutomationAccessCheckResult {
  allowed: boolean;
  error?: 'AUTOMATION_LOCKED' | 'COMPANY_NOT_FOUND';
  message?: string;
  statusCode: number;
}

/**
 * All supported automation types in the platform.
 */
export const ALL_AUTOMATION_TYPES: AutomationType[] = [
  AutomationType.web,
  AutomationType.whatsapp,
  AutomationType.email,
];

/**
 * Initializes default automation access records for a company if not present.
 * Web and Email are active by default; WhatsApp is locked by default.
 */
export async function ensureDefaultAutomationAccess(companyId: string): Promise<void> {
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setMonth(nextReset.getMonth() + 1);

  for (const type of ALL_AUTOMATION_TYPES) {
    const isDefaultActive = type === AutomationType.web || type === AutomationType.email;
    await prisma.automationAccess.upsert({
      where: {
        companyId_automationType: {
          companyId,
          automationType: type,
        },
      },
      update: {},
      create: {
        companyId,
        automationType: type,
        enabled: isDefaultActive,
        activatedAt: isDefaultActive ? now : null,
        nextResetAt: type === AutomationType.email ? nextReset : null,
      },
    });
  }
}

/**
 * Retrieves the automation access record for a specific company and automation type.
 */
export async function getAutomationAccess(
  companyId: string,
  automationType: AutomationType
): Promise<AutomationAccess | null> {
  return prisma.automationAccess.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
  });
}

/**
 * Checks whether an automation is currently enabled and unexpired for a company.
 * Default behavior:
 * - Web Automation = ACTIVE (true)
 * - WhatsApp Automation = LOCKED (false)
 * - Email Automation = ACTIVE (true)
 */
export async function isAutomationEnabled(
  companyId: string,
  automationType: AutomationType
): Promise<boolean> {
  const access = await getAutomationAccess(companyId, automationType);

  // If no record exists yet, apply platform baseline defaults
  if (!access) {
    if (automationType === AutomationType.web || automationType === AutomationType.email) {
      // Lazy initialize default records in background
      ensureDefaultAutomationAccess(companyId).catch((err) =>
        console.error('[AutomationAccess] Error initializing default access:', err)
      );
      return true;
    }
    return false;
  }

  if (!access.enabled) {
    return false;
  }

  // Check expiration if set
  if (access.expiresAt && new Date(access.expiresAt) <= new Date()) {
    return false;
  }

  return true;
}

/**
 * Activates an automation for a company (Admin / Payment-activated).
 */
export async function activateAutomation(
  companyId: string,
  automationType: AutomationType,
  expiresAt?: Date | null
): Promise<AutomationAccess> {
  return prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
    update: {
      enabled: true,
      activatedAt: new Date(),
      expiresAt: expiresAt ?? null,
    },
    create: {
      companyId,
      automationType,
      enabled: true,
      activatedAt: new Date(),
      expiresAt: expiresAt ?? null,
    },
  });
}

/**
 * Deactivates an automation for a company.
 */
export async function deactivateAutomation(
  companyId: string,
  automationType: AutomationType
): Promise<AutomationAccess> {
  return prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType,
      },
    },
    update: {
      enabled: false,
    },
    create: {
      companyId,
      automationType,
      enabled: false,
      activatedAt: null,
      expiresAt: null,
    },
  });
}

/**
 * Retrieves the status of all three platform automations for a company,
 * guaranteeing consistent representation of [web, whatsapp, email].
 */
export async function getCompanyAutomations(
  companyId: string
): Promise<CompanyAutomationStatus[]> {
  const records = await prisma.automationAccess.findMany({
    where: { companyId },
  });

  const recordMap = new Map<AutomationType, AutomationAccess>();
  for (const r of records) {
    recordMap.set(r.automationType, r);
  }

  return ALL_AUTOMATION_TYPES.map((type) => {
    const r = recordMap.get(type);
    if (!r) {
      const isDefaultActive = type === AutomationType.web || type === AutomationType.email;
      return {
        automationType: type,
        enabled: isDefaultActive,
        activatedAt: isDefaultActive ? new Date() : null,
        expiresAt: null,
      };
    }

    const isExpired = r.expiresAt ? new Date(r.expiresAt) <= new Date() : false;
    return {
      automationType: type,
      enabled: r.enabled && !isExpired,
      activatedAt: r.activatedAt,
      expiresAt: r.expiresAt,
    };
  });
}

/**
 * Reusable server-side guard for API routes.
 */
export async function requireAutomationAccess(
  companyId: string,
  automationType: AutomationType
): Promise<AutomationAccessCheckResult> {
  const enabled = await isAutomationEnabled(companyId, automationType);

  if (!enabled) {
    const formattedName =
      automationType === AutomationType.web
        ? 'Web Automation'
        : automationType === AutomationType.whatsapp
        ? 'WhatsApp Automation'
        : 'Email Automation';

    return {
      allowed: false,
      error: 'AUTOMATION_LOCKED',
      message: `${formattedName} is not active for this company.`,
      statusCode: 403,
    };
  }

  return {
    allowed: true,
    statusCode: 200,
  };
}
