import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// JWT secret key - should match the one in the login API
// Note: JWT_SECRET is configured via environment variable but verification is done server-side

// Simple function to verify JWT token format without decoding
// This is a simplified version for testing - in production use proper verification
function verifyToken(token: string): boolean {
  try {
    // Simple check: JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    return parts.length === 3;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // Paths that don't require authentication
  const publicPaths = ['/login', '/api/auth/login'];

  // Check if the requested path is a public path
  const isPublicPath = publicPaths.some(path =>
    request.nextUrl.pathname === path ||
    request.nextUrl.pathname.startsWith('/api/auth/')
  );

  // Check if it's an API route (except auth-related routes)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/auth/');

  // Get auth cookie
  const authToken = request.cookies.get('auth_token')?.value;

  // If it's a public path, allow access
  if (isPublicPath) {
    // If user is already logged in and trying to access login page, redirect to dashboard
    if (authToken && verifyToken(authToken) && request.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  }

  // For protected routes, check if user is authenticated
  if (!authToken || !verifyToken(authToken)) {
    // For API routes, return 401 Unauthorized
    if (isApiRoute) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For other routes, redirect to login page
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is authenticated and trying to access a protected route, allow access
  return NextResponse.next();
}

// Configure the middleware to apply to all routes
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}; 