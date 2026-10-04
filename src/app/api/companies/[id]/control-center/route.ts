import { NextRequest } from 'next/server';
import { getCompanyById } from '@/lib/services/companyService';
import {
  getCompanyPermissionConfig,
  updateCompanyPermissionConfig,
  setAIAutonomyMode,
  setEmergencyOutboundPause,
} from '@/lib/services/companyPermissionService';
import { requireCompanyAuth } from '@/lib/auth/session';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { isNonEmptyString } from '@/lib/validators';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!isNonEmptyString(companyId)) {
      return errorResponse('Company ID parameter is required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const config = await getCompanyPermissionConfig(companyId);
    return successResponse(config, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;

    if (!isNonEmptyString(companyId)) {
      return errorResponse('Company ID parameter is required.', 400);
    }

    await requireCompanyAuth(companyId, request);

    const company = await getCompanyById(companyId);
    if (!company) {
      return errorResponse(`Company with id "${companyId}" not found.`, 404);
    }

    const body = await request.json();

    if (body.autonomyMode !== undefined && (body.autonomyMode === 'LIMITED_ACCESS' || body.autonomyMode === 'NO_AUTONOMOUS_ACCESS')) {
      await setAIAutonomyMode(companyId, body.autonomyMode);
    }

    if (body.outboundPaused !== undefined && typeof body.outboundPaused === 'boolean') {
      await setEmergencyOutboundPause(companyId, body.outboundPaused);
    }

    const updated = await updateCompanyPermissionConfig(companyId, body);
    return successResponse(updated, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
