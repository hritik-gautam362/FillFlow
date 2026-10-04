import { successResponse } from '@/lib/api-response';
import { AUTH_COOKIE_NAME } from '@/lib/auth/jwt';

export async function POST() {
  const response = successResponse({ message: 'Successfully logged out.' });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
