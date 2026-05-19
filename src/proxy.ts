import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';
import { apiErrorResponse } from '@/lib/api/errors';
import { createLogContext, logWarn } from '@/lib/observability/logger';

const PUBLIC_AUTH_PATHS = ['/login', '/api/auth/login'];
const PUBLIC_FILE_PATTERN = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|woff2?)$/i;
const MANAGER_PAGE_PATHS = [
  '/',
  '/materials',
  '/manage-workers',
  '/worker-productivity',
  '/sales',
  '/collective-sales',
  '/notices',
  '/gamification',
  '/profile',
];

function clearAuthCookie(response: NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

function isPublicPath(pathname: string) {
  if (pathname.startsWith('/api/')) {
    return PUBLIC_AUTH_PATHS.includes(pathname) || pathname.startsWith('/api/auth/');
  }

  return (
    PUBLIC_AUTH_PATHS.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

function isManagerPagePath(pathname: string) {
  return MANAGER_PAGE_PATHS.some((path) => (
    pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))
  ));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const context = createLogContext(request, { domain: 'auth' });
  const publicPath = isPublicPath(pathname);
  const isApiRoute = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
  const authToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = authToken ? await verifyAuthTokenEdge(authToken) : null;

  if (publicPath) {
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const response = NextResponse.next();
    if (authToken && !session) {
      logWarn('auth.proxy.invalid_cookie_cleared', context);
      return clearAuthCookie(response);
    }

    return response;
  }

  if (!session) {
    if (isApiRoute) {
      logWarn('auth.proxy.api_unauthorized', context, {
        hasCookie: Boolean(authToken),
      });
      return clearAuthCookie(apiErrorResponse({
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
        status: 401,
        requestId: context.requestId,
      }));
    }

    if (authToken) {
      logWarn('auth.proxy.page_invalid_cookie_redirected', context);
    }

    return clearAuthCookie(NextResponse.redirect(new URL('/login', request.url)));
  }

  if (session.role === 'worker' && (isApiRoute || isManagerPagePath(pathname))) {
    logWarn('auth.proxy.worker_denied', context, {
      workerId: session.workerId,
      role: session.role,
    });

    if (isApiRoute) {
      return clearAuthCookie(apiErrorResponse({
        message: 'Acesso restrito apenas para gestores',
        code: 'MANAGER_REQUIRED',
        status: 403,
        requestId: context.requestId,
      }));
    }

    return clearAuthCookie(NextResponse.redirect(new URL('/login?reason=web-role-denied', request.url)));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
