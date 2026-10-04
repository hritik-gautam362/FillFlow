import { NextRequest } from 'next/server';
import { createLead, getLeadsByCompanyId } from '@/lib/services/leadService';
import { getCompanyById } from '@/lib/services/companyService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import {
  isNonEmptyString,
  isValidEmail,
  isValidChannelSource,
  isValidLeadStatus,
} from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
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

    // Required fields validation
    if (!isNonEmptyString(companyId)) {
      return errorResponse('companyId is required.', 400);
    }
    if (!isNonEmptyString(clientName)) {
      return errorResponse('clientName is required.', 400);
    }
    if (!isNonEmptyString(companyName)) {
      return errorResponse('companyName is required.', 400);
    }
    if (!isNonEmptyString(email)) {
      return errorResponse('email is required.', 400);
    }
    if (!isValidEmail(email)) {
      return errorResponse('A valid email address is required.', 400);
    }
    if (!isNonEmptyString(phone)) {
      return errorResponse('phone is required.', 400);
    }

    // Enum validation
    if (channel !== undefined && !isValidChannelSource(channel)) {
      return errorResponse(`Invalid channel "${channel}". Allowed values: whatsapp, web_chat, contact_form.`, 400);
    }
    if (status !== undefined && !isValidLeadStatus(status)) {
      return errorResponse(`Invalid status "${status}". Allowed values: new, qualifying, qualified, disqualified, brief_ready, converted.`, 400);
    }

    if (qualificationScore !== undefined && (typeof qualificationScore !== 'number' || qualificationScore < 0 || qualificationScore > 100)) {
      return errorResponse('qualificationScore must be a number between 0 and 100.', 400);
    }

    // Multi-tenant check
    await requireCompanyAuth(companyId, request);

    const lead = await createLead({
      companyId,
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
    });

    return successResponse(lead, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    // Strict company isolation: companyId MUST be supplied
    if (!companyId || !isNonEmptyString(companyId)) {
      return errorResponse('companyId query parameter is required to list leads.', 400);
    }

    // Multi-tenant authorization enforcement
    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const leads = await getLeadsByCompanyId(companyId);
    return successResponse(leads, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
