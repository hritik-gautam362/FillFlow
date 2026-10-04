import { NextRequest } from 'next/server';
import { updateLeadStatus } from '@/lib/services/leadService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString, isValidLeadStatus } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!isNonEmptyString(id)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const body = await request.json();
    const { status } = body;

    if (!isValidLeadStatus(status)) {
      return errorResponse(
        `Invalid status "${status}". Allowed values: new, qualifying, qualified, disqualified, brief_ready, converted.`,
        400
      );
    }

    const updated = await updateLeadStatus(id, status, companyId);
    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
