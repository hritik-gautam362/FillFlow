import { NextRequest } from 'next/server';
import { getLeadById, updateLead } from '@/lib/services/leadService';
import { requireAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import {
  isNonEmptyString,
  isValidEmail,
  isValidChannelSource,
  isValidLeadStatus,
} from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!isNonEmptyString(id)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const lead = await getLeadById(id, companyId);
    if (!lead) {
      return errorResponse(`Lead with id "${id}" not found.`, 404);
    }

    return successResponse(lead, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!isNonEmptyString(id)) {
      return errorResponse('Lead ID is required.', 400);
    }

    const session = await requireAuth(request);
    const companyId = session.user.role === 'platform_admin' ? undefined : session.company.id;

    const body = await request.json();
    const {
      clientName,
      companyName,
      email,
      phone,
      channel,
      status,
      qualificationScore,
      estimatedBudget,
      requestedTimeline,
      projectType,
      assignedManager,
      notes,
    } = body;

    // Validate partial inputs if provided
    if (clientName !== undefined && !isNonEmptyString(clientName)) {
      return errorResponse('clientName cannot be empty.', 400);
    }
    if (companyName !== undefined && !isNonEmptyString(companyName)) {
      return errorResponse('companyName cannot be empty.', 400);
    }
    if (email !== undefined && (!isNonEmptyString(email) || !isValidEmail(email))) {
      return errorResponse('A valid email address is required.', 400);
    }
    if (phone !== undefined && !isNonEmptyString(phone)) {
      return errorResponse('phone cannot be empty.', 400);
    }
    if (channel !== undefined && !isValidChannelSource(channel)) {
      return errorResponse(`Invalid channel "${channel}".`, 400);
    }
    if (status !== undefined && !isValidLeadStatus(status)) {
      return errorResponse(`Invalid status "${status}".`, 400);
    }
    if (qualificationScore !== undefined && (typeof qualificationScore !== 'number' || qualificationScore < 0 || qualificationScore > 100)) {
      return errorResponse('qualificationScore must be a number between 0 and 100.', 400);
    }

    const updated = await updateLead(
      id,
      {
        clientName,
        companyName,
        email,
        phone,
        channel,
        status,
        qualificationScore,
        estimatedBudget,
        requestedTimeline,
        projectType,
        assignedManager,
        notes,
      },
      companyId
    );

    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
