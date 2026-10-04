import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
};

export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(message: string, status = 400, details?: unknown): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: message, details }, { status });
}

export function handleApiError(error: unknown): NextResponse<ApiResponse> {
  console.error('[API_ERROR]', error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: Unique constraint failed
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || [];
      return errorResponse(`A record with this ${target.join(', ') || 'field'} already exists.`, 409);
    }
    // P2025: Record not found
    if (error.code === 'P2025') {
      return errorResponse('Requested record was not found.', 404);
    }
    // P2003: Foreign key constraint failed
    if (error.code === 'P2003') {
      return errorResponse('Referenced record does not exist.', 400);
    }
    return errorResponse(`Database error: ${error.code}`, 400);
  }

  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return errorResponse('Invalid or malformed JSON in request body.', 400);
  }

  if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AuthError') {
    const authErr = error as unknown as { message: string; statusCode: number };
    return errorResponse(authErr.message, authErr.statusCode || 401);
  }

  if (error instanceof Error) {
    const isProd = process.env.NODE_ENV === 'production';
    const devDetails = !isProd ? {
      name: error.name,
      stack: error.stack,
      cause: error.cause ? String(error.cause) : undefined,
    } : undefined;

    const isSensitive = /prisma|database|connection|password|secret|bearer|token|file:\/\//i.test(error.message);
    const safeMessage = isProd && isSensitive
      ? 'An unexpected internal error occurred.'
      : (error.message || 'An unexpected error occurred.');

    return errorResponse(safeMessage, 500, devDetails);
  }

  return errorResponse('Internal Server Error', 500);
}
