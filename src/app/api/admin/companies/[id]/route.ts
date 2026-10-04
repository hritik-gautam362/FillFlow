import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/auth/session';
import { getCompanyAutomations } from '@/lib/services/automationAccessService';
import { getCompanyConnections } from '@/lib/services/automationConnectionService';
import { getEmailQuota, getQuotaAuditLogs } from '@/lib/services/emailQuotaService';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/companies/[id]
 * Platform admin only: detailed view of a company.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requirePlatformAdmin(request);

    const { id: companyId } = await context.params;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!company) {
      return errorResponse('Company not found.', 404);
    }

    const automations = await getCompanyAutomations(companyId);
    const connections = await getCompanyConnections(companyId);
    const emailQuota = await getEmailQuota(companyId);
    const auditLogs = await getQuotaAuditLogs(companyId, 15);

    return successResponse(
      {
        ...company,
        leadCount: company._count.leads,
        automations,
        connections,
        emailQuota,
        auditLogs,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}
