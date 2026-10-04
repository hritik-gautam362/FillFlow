import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin } from '@/lib/auth/session';
import { getCompanyAutomations } from '@/lib/services/automationAccessService';
import { getCompanyConnections } from '@/lib/services/automationConnectionService';
import { getEmailQuota } from '@/lib/services/emailQuotaService';
import { successResponse, handleApiError } from '@/lib/api-response';

/**
 * GET /api/admin/companies
 * Platform admin only: list all companies with their users, automation access, and connection statuses.
 */
export async function GET(request: NextRequest) {
  try {
    // Only platform_admin can access
    await requirePlatformAdmin(request);

    const companies = await prisma.company.findMany({
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
        automationAccess: true,
        automationConnections: true,
        _count: {
          select: {
            leads: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      companies.map(async (c) => {
        const automations = await getCompanyAutomations(c.id);
        const connections = await getCompanyConnections(c.id);
        const emailQuota = await getEmailQuota(c.id);
        return {
          id: c.id,
          name: c.name,
          logo: c.logo,
          industry: c.industry,
          teamSize: c.teamSize,
          createdAt: c.createdAt,
          leadCount: c._count.leads,
          users: c.users,
          automations,
          connections,
          emailQuota,
        };
      })
    );

    return successResponse(enriched, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
