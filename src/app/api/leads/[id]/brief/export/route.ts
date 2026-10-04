import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateProjectBriefWorkbook, generateSanitizedFilename } from '@/lib/services/excelService';
import { requireAuth } from '@/lib/auth/session';
import { errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params;

    if (!isNonEmptyString(leadId)) {
      return errorResponse('Lead ID parameter is required.', 400);
    }

    const session = await requireAuth(request);
    const userCompanyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    // 1. Fetch the lead with its brief and features
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        projectBrief: {
          include: {
            features: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!lead) {
      return errorResponse(`Lead with ID "${leadId}" was not found.`, 404);
    }

    if (userCompanyId && lead.companyId !== userCompanyId) {
      return errorResponse('Access denied: Lead does not belong to your company.', 403);
    }

    // 2. Verify ProjectBrief exists
    if (!lead.projectBrief) {
      return errorResponse(
        `No Project Brief has been generated yet for lead "${leadId}". The lead is currently in "${lead.status}" status.`,
        404
      );
    }

    const brief = lead.projectBrief;

    // 3. Generate XLSX Workbook Buffer
    const buffer = await generateProjectBriefWorkbook({
      ...brief,
      lead,
      features: brief.features,
    });

    const filename = generateSanitizedFilename(lead.companyName, brief.projectType || brief.title);

    // 4. Return binary XLSX file with download headers
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
