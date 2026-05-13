import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';

const PUBLIC_AUTH_PATHS = ['/login', '/api/auth/login'];
const PUBLIC_FILE_PATTERN = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|woff2?)$/i;

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);
  const isApiRoute = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
  const authToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = authToken ? await verifyAuthTokenEdge(authToken) : null;

  if (publicPath) {
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const response = NextResponse.next();
    return authToken && !session ? clearAuthCookie(response) : response;
  }

  if (!session) {
    if (isApiRoute) {
      return clearAuthCookie(NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 },
      ));
    }

    return clearAuthCookie(NextResponse.redirect(new URL('/login', request.url)));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
