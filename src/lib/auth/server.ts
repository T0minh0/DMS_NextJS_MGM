import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { getJwtSecret } from './secret';
import { apiErrorResponse } from '@/lib/api/errors';
import { createLogContext, LogContext, logWarn } from '@/lib/observability/logger';
import {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  AUTH_TOKEN_TTL_SECONDS,
  AuthError,
  AuthSession,
  AuthTokenPayload,
  UserRole,
  normalizeAuthPayload,
  parseScopedId,
  payloadToSession,
  requirePermission,
} from './shared';

export interface SignAuthTokenInput {
  workerId: string;
  cooperativeId: string;
  role: UserRole;
  userType: number;
  name: string;
  cpf?: string;
  cooperativeName?: string | null;
}

export function signAuthToken(input: SignAuthTokenInput) {
  const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
    sub: input.workerId,
    workerId: input.workerId,
    cooperativeId: input.cooperativeId,
    role: input.role,
    userType: input.userType,
    name: input.name,
    cpf: input.cpf,
    cooperativeName: input.cooperativeName,
  };

  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    audience: AUTH_TOKEN_AUDIENCE,
    issuer: AUTH_TOKEN_ISSUER,
    expiresIn: AUTH_TOKEN_TTL_SECONDS,
  });
}

export function verifyAuthToken(token: string) {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: AUTH_TOKEN_AUDIENCE,
      issuer: AUTH_TOKEN_ISSUER,
    });
    const payload = normalizeAuthPayload(decoded);

    if (!payload) {
      throw new AuthError('Sessão inválida', 401, 'INVALID_TOKEN_PAYLOAD');
    }

    return payloadToSession(payload);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('Sessão inválida ou expirada', 401, 'INVALID_TOKEN');
  }
}

export async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    throw new AuthError('Sessão não encontrada', 401, 'MISSING_TOKEN');
  }

  return verifyAuthToken(token);
}

export async function requireAdmin() {
  const session = await requireAuth();

  if (session.role !== 'admin') {
    throw new AuthError('Acesso restrito a administradores', 403, 'ADMIN_REQUIRED');
  }

  return session;
}

export async function requireManagerOrAdmin() {
  const session = await requireAuth();

  if (session.role !== 'admin' && session.role !== 'manager') {
    throw new AuthError('Acesso restrito a gestores', 403, 'MANAGER_REQUIRED');
  }

  return session;
}

export function determineTargetCooperative(
  session: AuthSession,
  requestedCooperativeId: string | bigint | number | null | undefined,
  options: { required: true },
): string;
export function determineTargetCooperative(
  session: AuthSession,
  requestedCooperativeId?: string | bigint | number | null,
  options?: { required?: false },
): string | null;
export function determineTargetCooperative(
  session: AuthSession,
  requestedCooperativeId?: string | bigint | number | null,
  options: { required?: boolean } = {},
) {
  const requested = parseScopedId(requestedCooperativeId, 'Cooperativa');

  if (session.role === 'admin') {
    if (requested) {
      return requested;
    }

    if (options.required) {
      return session.cooperativeId;
    }

    return null;
  }

  if (requested && requested !== session.cooperativeId) {
    throw new AuthError('Cooperativa fora do escopo da sessão', 403, 'COOPERATIVE_SCOPE_DENIED');
  }

  return session.cooperativeId;
}

export function determineTargetWorker(
  session: AuthSession,
  requestedWorkerId: string | bigint | number | null | undefined,
  options: { required: true },
): string;
export function determineTargetWorker(
  session: AuthSession,
  requestedWorkerId?: string | bigint | number | null,
  options?: { required?: false },
): string | null;
export function determineTargetWorker(
  session: AuthSession,
  requestedWorkerId?: string | bigint | number | null,
  options: { required?: boolean } = {},
) {
  const requested = parseScopedId(requestedWorkerId, 'Trabalhador');

  if (session.role === 'worker') {
    if (requested && requested !== session.workerId) {
      throw new AuthError('Usuário fora do escopo da sessão', 403, 'WORKER_SCOPE_DENIED');
    }

    return session.workerId;
  }

  if (requested) {
    return requested;
  }

  if (options.required) {
    return session.workerId;
  }

  return null;
}

export function requireScopedPermission(
  session: AuthSession,
  ...args: Parameters<typeof requirePermission> extends [AuthSession, ...infer Rest] ? Rest : never
) {
  requirePermission(session, ...args);
}

function resolveAuthLogContext(contextOrRequest?: LogContext | Request | null) {
  if (!contextOrRequest) {
    return undefined;
  }

  if (contextOrRequest instanceof Request) {
    return createLogContext(contextOrRequest, { domain: 'auth' });
  }

  return contextOrRequest;
}

export function authErrorResponse(error: unknown, contextOrRequest?: LogContext | Request | null) {
  if (error instanceof AuthError) {
    const context = resolveAuthLogContext(contextOrRequest);

    if (context) {
      logWarn('auth.rejected', context, {
        code: error.code,
        status: error.status,
      });
    }

    return apiErrorResponse({
      message: error.message,
      code: error.code,
      status: error.status,
      requestId: context?.requestId,
    });
  }

  return null;
}
