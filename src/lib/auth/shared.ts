export const AUTH_COOKIE_NAME = 'auth_token';
export const AUTH_TOKEN_ISSUER = 'dms-nextjs-mgm';
export const AUTH_TOKEN_AUDIENCE = 'dms-dashboard';
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 8;

export type UserRole = 'admin' | 'manager' | 'worker';

export type RbacResource =
  | 'auth'
  | 'stock'
  | 'sales'
  | 'cooperatives'
  | 'materials'
  | 'users'
  | 'notices'
  | 'reports'
  | 'gamification';

export type RbacAction =
  | 'login'
  | 'logout'
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'manage'
  | 'recalculate';

export type RbacScope = 'public' | 'self' | 'cooperative' | 'global';

export interface AuthTokenPayload {
  sub: string;
  workerId: string;
  cooperativeId: string;
  role: UserRole;
  userType: number;
  name: string;
  cpf?: string;
  cooperativeName?: string | null;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
}

export interface AuthSession {
  workerId: string;
  cooperativeId: string;
  role: UserRole;
  userType: number;
  name: string;
  cpf?: string;
  cooperativeName?: string | null;
}

type RoleRule = Partial<Record<UserRole, RbacScope[]>>;
type ResourceRule = Partial<Record<RbacAction, RoleRule>>;

export const RBAC_MATRIX: Record<RbacResource, ResourceRule> = {
  auth: {
    login: { admin: ['public'], manager: ['public'], worker: ['public'] },
    logout: { admin: ['self'], manager: ['self'], worker: ['self'] },
    read: { admin: ['self'], manager: ['self'], worker: ['self'] },
  },
  stock: {
    read: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    create: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    update: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    manage: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
  },
  sales: {
    read: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    create: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    update: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    delete: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
  },
  cooperatives: {
    read: { admin: ['global'], manager: ['cooperative'], worker: ['self'] },
    create: { admin: ['global'] },
    update: { admin: ['global'] },
    delete: { admin: ['global'] },
    manage: { admin: ['global'] },
  },
  materials: {
    read: { admin: ['global'], manager: ['cooperative'], worker: ['self'] },
    create: { admin: ['global'] },
    update: { admin: ['global'] },
    delete: { admin: ['global'] },
    manage: { admin: ['global'] },
  },
  users: {
    read: { admin: ['global', 'cooperative', 'self'], manager: ['cooperative', 'self'], worker: ['self'] },
    create: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    update: { admin: ['global', 'cooperative', 'self'], manager: ['cooperative', 'self'], worker: ['self'] },
    delete: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    manage: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
  },
  notices: {
    read: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    create: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    update: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    delete: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
  },
  reports: {
    read: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    manage: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
    recalculate: { admin: ['global'] },
  },
  gamification: {
    read: { admin: ['global', 'cooperative'], manager: ['cooperative'], worker: ['self'] },
    update: { admin: ['global', 'cooperative'], manager: ['cooperative'] },
  },
};

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
    public readonly code = 'AUTH_ERROR',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function mapDatabaseUserTypeToRole(rawType: string | number | null | undefined): UserRole | null {
  if (rawType === null || rawType === undefined) {
    return null;
  }

  const normalized = String(rawType).trim().toUpperCase();

  if (normalized === 'A' || normalized === 'ADMIN') {
    return 'admin';
  }

  if (normalized === 'M' || normalized === 'MANAGER' || normalized === '0') {
    return 'admin';
  }

  if (normalized === 'W' || normalized === 'WORKER' || normalized === 'C' || normalized === '1') {
    return 'worker';
  }

  return null;
}

export function roleToUserType(role: UserRole) {
  return role === 'worker' ? 1 : 0;
}

export function normalizeAuthPayload(payload: unknown): AuthTokenPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const role = typeof data.role === 'string' ? mapDatabaseUserTypeToRole(data.role) : null;
  const workerId = data.workerId ?? data.id ?? data.sub;
  const cooperativeId = data.cooperativeId ?? data.cooperative_id;
  const name = data.name ?? data.full_name;

  if (!role || typeof workerId !== 'string' || typeof cooperativeId !== 'string' || typeof name !== 'string') {
    return null;
  }

  const userType = typeof data.userType === 'number' ? data.userType : roleToUserType(role);

  return {
    sub: typeof data.sub === 'string' ? data.sub : workerId,
    workerId,
    cooperativeId,
    role,
    userType,
    name,
    cpf: typeof data.cpf === 'string' ? data.cpf : undefined,
    cooperativeName:
      typeof data.cooperativeName === 'string'
        ? data.cooperativeName
        : typeof data.cooperative_name === 'string'
          ? data.cooperative_name
          : null,
    iss: typeof data.iss === 'string' ? data.iss : undefined,
    aud: typeof data.aud === 'string' ? data.aud : undefined,
    iat: typeof data.iat === 'number' ? data.iat : undefined,
    exp: typeof data.exp === 'number' ? data.exp : undefined,
    nbf: typeof data.nbf === 'number' ? data.nbf : undefined,
  };
}

export function payloadToSession(payload: AuthTokenPayload): AuthSession {
  return {
    workerId: payload.workerId,
    cooperativeId: payload.cooperativeId,
    role: payload.role,
    userType: payload.userType,
    name: payload.name,
    cpf: payload.cpf,
    cooperativeName: payload.cooperativeName,
  };
}

export function getAllowedScopes(role: UserRole, resource: RbacResource, action: RbacAction) {
  return RBAC_MATRIX[resource][action]?.[role] ?? [];
}

export function canAccess(role: UserRole, resource: RbacResource, action: RbacAction, scope: RbacScope) {
  return getAllowedScopes(role, resource, action).includes(scope);
}

export function requirePermission(
  session: AuthSession,
  resource: RbacResource,
  action: RbacAction,
  scope: RbacScope,
) {
  if (!canAccess(session.role, resource, action, scope)) {
    throw new AuthError('Permissão insuficiente', 403, 'FORBIDDEN');
  }
}

export function parseScopedId(value: string | bigint | number | null | undefined, fieldName = 'ID') {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  try {
    return BigInt(value).toString();
  } catch {
    throw new AuthError(`${fieldName} inválido`, 400, 'INVALID_SCOPE');
  }
}
