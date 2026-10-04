import { prisma } from '@/lib/prisma';
import { AutomationType, ConnectionStatus, Prisma } from '@prisma/client';

export type EmailAutomationStatus =
  | 'ACTIVE'
  | 'QUOTA_LOCKED'
  | 'ADMIN_DISABLED'
  | 'DISCONNECTED';

export interface CompanyEmailQuotaInfo {
  companyId: string;
  monthlyLimit: number;
  usedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  usagePercentage: number;
  automationStatus: EmailAutomationStatus;
  adminDisabled: boolean;
  quotaLocked: boolean;
  quotaPeriodStart: Date;
  nextResetAt: Date;
  lastResetAt: Date | null;
  isGmailConnected: boolean;
  connectedEmail: string | null;
}

export interface QuotaReservationResult {
  success: boolean;
  status: EmailAutomationStatus;
  reason?: string;
  remainingCredits: number;
  usedCredits: number;
  monthlyLimit: number;
}

/**
 * Deterministic resolution of Email Automation State.
 * Precedence:
 * 1. DISCONNECTED: Gmail is not active/connected
 * 2. ADMIN_DISABLED: Platform admin manually disabled automation
 * 3. QUOTA_LOCKED: Monthly allowance exhausted (remaining <= 0 or quotaLocked)
 * 4. ACTIVE: Connected, not admin-disabled, and remaining credits > 0
 */
export function determineEmailAutomationStatus(params: {
  isGmailConnected: boolean;
  adminDisabled: boolean;
  quotaLocked: boolean;
  remainingCredits: number;
}): EmailAutomationStatus {
  if (!params.isGmailConnected) {
    return 'DISCONNECTED';
  }
  if (params.adminDisabled) {
    return 'ADMIN_DISABLED';
  }
  if (params.remainingCredits <= 0) {
    return 'QUOTA_LOCKED';
  }
  if (params.quotaLocked && params.remainingCredits <= 0) {
    return 'QUOTA_LOCKED';
  }
  return 'ACTIVE';
}

/**
 * Calculates the next monthly reset date starting from a baseline date.
 */
export function computeNextResetDate(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Records an audit log entry for quota and auto-lock events.
 */
export async function recordQuotaAuditLog(
  companyId: string,
  action:
    | 'LIMIT_CHANGED'
    | 'QUOTA_LOCKED'
    | 'QUOTA_UNLOCKED'
    | 'MONTHLY_RESET'
    | 'ADMIN_ENABLED'
    | 'ADMIN_DISABLED'
    | 'CREDIT_CONSUMED'
    | 'CREDIT_RELEASED',
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.automationQuotaAuditLog.create({
      data: {
        companyId,
        automationType: AutomationType.email,
        action,
        details: details ? (details as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  } catch (err) {
    console.error(`[QuotaAuditLog] Failed to record action ${action} for company ${companyId}:`, err);
  }
}

/**
 * Ensures that an AutomationAccess record exists for the company with proper defaults.
 */
export async function ensureEmailAutomationAccess(companyId: string) {
  const now = new Date();
  const nextReset = computeNextResetDate(now);

  return prisma.automationAccess.upsert({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
    update: {},
    create: {
      companyId,
      automationType: AutomationType.email,
      enabled: true, // Default enabled unless admin disabled
      monthlyLimit: 100,
      usedCredits: 0,
      reservedCredits: 0,
      quotaLocked: false,
      adminDisabled: false,
      quotaPeriodStart: now,
      nextResetAt: nextReset,
    },
  });
}

/**
 * Checks whether the current quota period has expired and triggers an idempotent monthly reset.
 */
export async function checkAndResetMonthlyQuotaIfNeeded(companyId: string): Promise<boolean> {
  const now = new Date();

  // Find access record
  const access = await prisma.automationAccess.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  if (!access) return false;

  const nextReset = access.nextResetAt || computeNextResetDate(access.quotaPeriodStart || now);

  if (now < nextReset) {
    if (!access.nextResetAt) {
      await prisma.automationAccess.update({
        where: { id: access.id },
        data: { nextResetAt: nextReset },
      }).catch(() => {});
    }
    return false; // Not yet time to reset
  }

  // Idempotent reset via atomic condition: nextResetAt <= NOW() or nextResetAt IS NULL
  const updated = await prisma.$executeRaw`
    UPDATE "AutomationAccess"
    SET "usedCredits" = 0,
        "reservedCredits" = 0,
        "quotaLocked" = false,
        "lastResetAt" = ${now},
        "quotaPeriodStart" = COALESCE("nextResetAt", ${now}),
        "nextResetAt" = COALESCE("nextResetAt", ${now}) + INTERVAL '1 month',
        "updatedAt" = ${now}
    WHERE "companyId" = ${companyId}
      AND "automationType" = 'email'::"AutomationType"
      AND ("nextResetAt" IS NULL OR "nextResetAt" <= ${now})
  `;

  if (updated > 0) {
    await recordQuotaAuditLog(companyId, 'MONTHLY_RESET', {
      previousUsedCredits: access.usedCredits,
      resetAt: now.toISOString(),
      wasQuotaLocked: access.quotaLocked,
      adminDisabled: access.adminDisabled,
    });

    if (access.quotaLocked && !access.adminDisabled) {
      await recordQuotaAuditLog(companyId, 'QUOTA_UNLOCKED', {
        reason: 'MONTHLY_RESET',
      });
    }
    return true;
  }

  return false;
}

/**
 * Retrieves the comprehensive Email Quota and Status for a company.
 */
export async function getEmailQuota(companyId: string): Promise<CompanyEmailQuotaInfo> {
  // 1. Check & execute lazy monthly reset if quota period expired
  await checkAndResetMonthlyQuotaIfNeeded(companyId);

  // 2. Fetch or create AutomationAccess
  let access = await prisma.automationAccess.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  if (!access) {
    access = await ensureEmailAutomationAccess(companyId);
  }

  // 3. Fetch Google Connection to verify active connection
  const connection = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  const isGmailConnected =
    connection?.status === ConnectionStatus.connected &&
    (connection?.provider === 'google' || connection?.provider === 'mailgun' || !connection?.provider);

  const connMeta = (connection?.metadata as Record<string, unknown>) || {};
  const connectedEmail =
    connection?.displayName ||
    (connMeta.googleEmail as string) ||
    null;

  const monthlyLimit = Math.max(0, access.monthlyLimit ?? 100);
  const usedCredits = Math.max(0, access.usedCredits ?? 0);
  const reservedCredits = Math.max(0, access.reservedCredits ?? 0);
  const effectiveUsed = usedCredits + reservedCredits;
  const remainingCredits = Math.max(0, monthlyLimit - effectiveUsed);
  const usagePercentage = monthlyLimit > 0 ? Math.min(100, Math.round((usedCredits / monthlyLimit) * 100)) : 100;

  // Self-heal: If quotaLocked is true in database but credits remain and workspace is not admin-disabled, unlock it
  let quotaLocked = access.quotaLocked;
  if (quotaLocked && remainingCredits > 0 && !access.adminDisabled) {
    quotaLocked = false;
    await prisma.automationAccess
      .update({
        where: { id: access.id },
        data: { quotaLocked: false },
      })
      .catch((err) => console.error('[EmailQuotaService] Error auto-clearing stale quotaLocked:', err));
  }

  const automationStatus = determineEmailAutomationStatus({
    isGmailConnected,
    adminDisabled: access.adminDisabled,
    quotaLocked: quotaLocked && remainingCredits <= 0,
    remainingCredits,
  });

  const nextResetAt = access.nextResetAt || computeNextResetDate(access.quotaPeriodStart || new Date());

  return {
    companyId,
    monthlyLimit,
    usedCredits,
    reservedCredits,
    remainingCredits,
    usagePercentage,
    automationStatus,
    adminDisabled: access.adminDisabled,
    quotaLocked,
    quotaPeriodStart: access.quotaPeriodStart || new Date(),
    nextResetAt,
    lastResetAt: access.lastResetAt,
    isGmailConnected,
    connectedEmail,
  };
}

/**
 * Atomically checks quota and reserves 1 credit before Gemini AI execution.
 * Concurrency safe: Uses atomic UPDATE with available credit check.
 */
export async function reserveEmailQuota(
  companyId: string,
  messageId: string
): Promise<QuotaReservationResult> {
  // Check lazy monthly reset first
  await checkAndResetMonthlyQuotaIfNeeded(companyId);
  await ensureEmailAutomationAccess(companyId);

  // Fetch connection status
  const connection = await prisma.automationConnection.findUnique({
    where: {
      companyId_automationType: {
        companyId,
        automationType: AutomationType.email,
      },
    },
  });

  const isConnected =
    connection?.status === ConnectionStatus.connected &&
    (connection?.provider === 'google' || connection?.provider === 'mailgun' || !connection?.provider);

  if (!isConnected) {
    return {
      success: false,
      status: 'DISCONNECTED',
      reason: 'Google Gmail connection is not active.',
      remainingCredits: 0,
      usedCredits: 0,
      monthlyLimit: 0,
    };
  }

  // Atomic reservation update:
  // Only succeeds if NOT adminDisabled and available credits > 0.
  // Dynamically sets quotaLocked = true if this reservation consumes the last credit,
  // or clears quotaLocked = false if credits remain.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      monthlyLimit: number;
      usedCredits: number;
      reservedCredits: number;
      quotaLocked: boolean;
      adminDisabled: boolean;
    }>
  >`
    UPDATE "AutomationAccess"
    SET "reservedCredits" = "reservedCredits" + 1,
        "quotaLocked" = CASE
          WHEN ("monthlyLimit" - "usedCredits" - ("reservedCredits" + 1)) <= 0 THEN true
          ELSE false
        END,
        "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND "automationType" = 'email'::"AutomationType"
      AND "adminDisabled" = false
      AND ("monthlyLimit" - "usedCredits" - "reservedCredits") > 0
    RETURNING "id", "monthlyLimit", "usedCredits", "reservedCredits", "quotaLocked", "adminDisabled"
  `;

  if (!rows || rows.length === 0) {
    // Reservation failed. Determine whether it's admin disabled or quota exhausted
    const current = await prisma.automationAccess.findUnique({
      where: {
        companyId_automationType: {
          companyId,
          automationType: AutomationType.email,
        },
      },
    });

    if (current?.adminDisabled) {
      return {
        success: false,
        status: 'ADMIN_DISABLED',
        reason: 'Email automation has been disabled by platform administrator.',
        remainingCredits: 0,
        usedCredits: current.usedCredits,
        monthlyLimit: current.monthlyLimit,
      };
    }

    const remaining = current ? Math.max(0, current.monthlyLimit - (current.usedCredits + current.reservedCredits)) : 0;

    // Only mark quotaLocked = true if quota is actually exhausted
    if (current && remaining <= 0 && !current.quotaLocked) {
      await prisma.automationAccess.update({
        where: { id: current.id },
        data: { quotaLocked: true },
      });
      await recordQuotaAuditLog(companyId, 'QUOTA_LOCKED', {
        reason: 'RESERVATION_EXHAUSTED',
        monthlyLimit: current.monthlyLimit,
        usedCredits: current.usedCredits,
        reservedCredits: current.reservedCredits,
        triggerMessageId: messageId,
      });
    }

    return {
      success: false,
      status: 'QUOTA_LOCKED',
      reason: remaining <= 0 ? 'Monthly AI email limit reached.' : 'Email reservation could not be acquired.',
      remainingCredits: remaining,
      usedCredits: current?.usedCredits ?? 0,
      monthlyLimit: current?.monthlyLimit ?? 100,
    };
  }

  const updatedRow = rows[0];
  const remaining = Math.max(
    0,
    updatedRow.monthlyLimit - (updatedRow.usedCredits + updatedRow.reservedCredits)
  );

  // If this reservation consumed the very last credit, log audit event
  if (remaining === 0 && updatedRow.quotaLocked) {
    await recordQuotaAuditLog(companyId, 'QUOTA_LOCKED', {
      reason: 'LIMIT_REACHED_BY_RESERVATION',
      monthlyLimit: updatedRow.monthlyLimit,
      usedCredits: updatedRow.usedCredits,
      reservedCredits: updatedRow.reservedCredits,
      triggerMessageId: messageId,
    });
  }

  return {
    success: true,
    status: 'ACTIVE',
    remainingCredits: remaining,
    usedCredits: updatedRow.usedCredits,
    monthlyLimit: updatedRow.monthlyLimit,
  };
}

/**
 * Releases a previously reserved credit (on AI failure, send failure, or duplicate detection).
 * Concurrency safe and never allows negative counters.
 */
export async function releaseEmailQuota(
  companyId: string,
  messageId: string,
  reason: string
): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        monthlyLimit: number;
        usedCredits: number;
        reservedCredits: number;
        quotaLocked: boolean;
        adminDisabled: boolean;
      }>
    >`
      UPDATE "AutomationAccess"
      SET "reservedCredits" = GREATEST("reservedCredits" - 1, 0),
          "quotaLocked" = CASE
            WHEN ("usedCredits" + GREATEST("reservedCredits" - 1, 0)) < "monthlyLimit" AND "adminDisabled" = false THEN false
            ELSE "quotaLocked"
          END,
          "updatedAt" = NOW()
      WHERE "companyId" = ${companyId}
        AND "automationType" = 'email'::"AutomationType"
      RETURNING "id", "monthlyLimit", "usedCredits", "reservedCredits", "quotaLocked", "adminDisabled"
    `;

    if (rows && rows.length > 0) {
      const row = rows[0];
      await recordQuotaAuditLog(companyId, 'CREDIT_RELEASED', {
        messageId,
        reason,
        reservedCredits: row.reservedCredits,
        usedCredits: row.usedCredits,
        remainingCredits: Math.max(0, row.monthlyLimit - (row.usedCredits + row.reservedCredits)),
      });
    }
  } catch (err) {
    console.error(`[EmailQuotaService] Failed to release quota for company ${companyId}:`, err);
  }
}

/**
 * Commits a successfully sent email reply, converting 1 reserved credit into 1 used credit.
 * Automatically engages QUOTA_LOCKED if limit is reached.
 */
export async function commitEmailQuota(
  companyId: string,
  messageId: string,
  details?: Record<string, unknown>
): Promise<{ usedCredits: number; remainingCredits: number; isLocked: boolean }> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      monthlyLimit: number;
      usedCredits: number;
      reservedCredits: number;
      quotaLocked: boolean;
      adminDisabled: boolean;
    }>
  >`
    UPDATE "AutomationAccess"
    SET "reservedCredits" = GREATEST("reservedCredits" - 1, 0),
        "usedCredits" = "usedCredits" + 1,
        "quotaLocked" = CASE
          WHEN ("monthlyLimit" - ("usedCredits" + 1) - GREATEST("reservedCredits" - 1, 0)) <= 0 THEN true
          ELSE false
        END,
        "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND "automationType" = 'email'::"AutomationType"
    RETURNING "id", "monthlyLimit", "usedCredits", "reservedCredits", "quotaLocked", "adminDisabled"
  `;

  if (!rows || rows.length === 0) {
    throw new Error(`Failed to commit quota for company ${companyId}`);
  }

  const row = rows[0];
  const remaining = Math.max(0, row.monthlyLimit - (row.usedCredits + row.reservedCredits));
  const isLocked = row.quotaLocked || remaining <= 0;

  await recordQuotaAuditLog(companyId, 'CREDIT_CONSUMED', {
    messageId,
    usedCredits: row.usedCredits,
    monthlyLimit: row.monthlyLimit,
    remainingCredits: remaining,
    ...details,
  });

  if (isLocked) {
    await recordQuotaAuditLog(companyId, 'QUOTA_LOCKED', {
      reason: 'LIMIT_REACHED_ON_COMMIT',
      usedCredits: row.usedCredits,
      monthlyLimit: row.monthlyLimit,
      triggerMessageId: messageId,
    });
  }

  return {
    usedCredits: row.usedCredits,
    remainingCredits: remaining,
    isLocked,
  };
}

/**
 * Updates a company's monthly AI email limit.
 * If company is QUOTA_LOCKED and new limit provides available credits,
 * automatically returns email automation to ACTIVE (unless adminDisabled).
 */
export async function updateMonthlyLimit(
  companyId: string,
  newLimit: number
): Promise<CompanyEmailQuotaInfo> {
  if (!Number.isInteger(newLimit) || newLimit < 0) {
    throw new Error('Monthly limit must be a non-negative integer.');
  }

  const access = await ensureEmailAutomationAccess(companyId);
  const oldLimit = access.monthlyLimit;
  const currentUsed = access.usedCredits + access.reservedCredits;
  const newRemaining = Math.max(0, newLimit - currentUsed);

  let shouldUnlock = false;
  let newQuotaLocked = access.quotaLocked;

  if (newRemaining > 0) {
    newQuotaLocked = false;
    if (access.quotaLocked && !access.adminDisabled) {
      shouldUnlock = true;
    }
  } else if (newRemaining === 0) {
    newQuotaLocked = true;
  }

  await prisma.automationAccess.update({
    where: { id: access.id },
    data: {
      monthlyLimit: newLimit,
      quotaLocked: newQuotaLocked,
    },
  });

  await recordQuotaAuditLog(companyId, 'LIMIT_CHANGED', {
    previousLimit: oldLimit,
    newLimit,
    usedCredits: access.usedCredits,
    remainingCredits: newRemaining,
  });

  if (shouldUnlock) {
    await recordQuotaAuditLog(companyId, 'QUOTA_UNLOCKED', {
      reason: 'LIMIT_INCREASED',
      newLimit,
      availableCredits: newRemaining,
    });
  }

  return getEmailQuota(companyId);
}

/**
 * Enables or disables Email Automation manually by a platform admin.
 * Admin disablement cannot be overridden by quota changes or resets.
 */
export async function setAdminAutomationDisabled(
  companyId: string,
  disabled: boolean
): Promise<CompanyEmailQuotaInfo> {
  const access = await ensureEmailAutomationAccess(companyId);

  await prisma.automationAccess.update({
    where: { id: access.id },
    data: {
      adminDisabled: disabled,
      enabled: !disabled, // Maintains backward compatibility
    },
  });

  await recordQuotaAuditLog(
    companyId,
    disabled ? 'ADMIN_DISABLED' : 'ADMIN_ENABLED',
    {
      adminDisabled: disabled,
      previousState: access.adminDisabled,
    }
  );

  return getEmailQuota(companyId);
}

/**
 * Resets a company's email usage credits.
 * If forced is true, resets immediately regardless of quota period.
 * Automatically unlocks a QUOTA_LOCKED company if not adminDisabled.
 */
export async function resetCompanyEmailQuota(
  companyId: string,
  force: boolean = false
): Promise<CompanyEmailQuotaInfo> {
  const access = await ensureEmailAutomationAccess(companyId);
  const now = new Date();
  const nextReset = computeNextResetDate(now);

  if (force) {
    await prisma.automationAccess.update({
      where: { id: access.id },
      data: {
        usedCredits: 0,
        reservedCredits: 0,
        quotaLocked: false,
        lastResetAt: now,
        quotaPeriodStart: now,
        nextResetAt: nextReset,
      },
    });

    await recordQuotaAuditLog(companyId, 'MONTHLY_RESET', {
      forced: true,
      previousUsedCredits: access.usedCredits,
      resetAt: now.toISOString(),
    });

    if (access.quotaLocked && !access.adminDisabled) {
      await recordQuotaAuditLog(companyId, 'QUOTA_UNLOCKED', {
        reason: 'FORCED_RESET',
      });
    }
  } else {
    await checkAndResetMonthlyQuotaIfNeeded(companyId);
  }

  return getEmailQuota(companyId);
}

/**
 * Retrieves audit log entries for a company.
 */
export async function getQuotaAuditLogs(companyId: string, limit: number = 20) {
  return prisma.automationQuotaAuditLog.findMany({
    where: {
      companyId,
      automationType: AutomationType.email,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
