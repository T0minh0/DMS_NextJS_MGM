import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthTokenEdge } from '@/lib/auth/edge';
import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';

const PUBLIC_AUTH_PATHS = ['/login', '/api/auth/login'];
const PUBLIC_FILE_PATTERN = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|woff2?)$/i;

function clearAuthCookie(response: NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_AUTH_PATHS.includes(pathname) ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE_PATTERN.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Paths that don't require authentication
  const publicPath = isPublicPath(pathname);

  // Check if it's an API route (except auth-related routes)
  const isApiRoute = pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/');

  // Get auth cookie
  const authToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = authToken ? await verifyAuthTokenEdge(authToken) : null;

  // If it's a public path, allow access
  if (publicPath) {
    // If user is already logged in and trying to access login page, redirect to dashboard
    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const response = NextResponse.next();
    return authToken && !session ? clearAuthCookie(response) : response;
  }

  // For protected routes, check if user is authenticated
  if (!session) {
    // For API routes, return 401 Unauthorized
    if (isApiRoute) {
      return clearAuthCookie(NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      ));
    }

    // For other routes, redirect to login page
    return clearAuthCookie(NextResponse.redirect(new URL('/login', request.url)));
  }

  // If user is authenticated and trying to access a protected route, allow access
  return NextResponse.next();
}

// Configure the middleware to apply to all routes
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
