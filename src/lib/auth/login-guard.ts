import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const DUMMY_LOGIN_PASSWORD_HASH = '$2a$10$PSd7CERT5Bq2SdMeYhnFiOCpaiRLEglLsGS4bV7z0sgP6yWdWtu2C';
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_SUBJECT_ATTEMPTS = 10;
const LOGIN_RATE_LIMIT_MAX_SOURCE_ATTEMPTS = 40;
const LOGIN_RATE_LIMIT_MAX_GLOBAL_ATTEMPTS = 200;

type LoginAttemptBucket = {
  count: number;
  resetAt: number;
};

type LoginAttemptKey = {
  key: string;
  limit: number;
};

const loginAttempts = new Map<string, LoginAttemptBucket>();

export function isBcryptHash(value: string) {
  return /^\$2[abxy]\$/.test(value);
}

export async function comparePasswordWithDummy(password: string, storedPassword?: string | null) {
  const hasUsableHash = Boolean(storedPassword && isBcryptHash(storedPassword));
  const hash = hasUsableHash ? storedPassword! : DUMMY_LOGIN_PASSWORD_HASH;
  const matches = await bcrypt.compare(password, hash);

  return {
    passwordIsValid: hasUsableHash && matches,
    usedLegacyPassword: Boolean(storedPassword && !hasUsableHash),
  };
}

function hashLoginKey(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function shouldTrustProxyHeaders() {
  return process.env.DMS_TRUST_PROXY_HEADERS === 'true';
}

export function getTrustedClientIp(request: Request) {
  if (!shouldTrustProxyHeaders()) {
    return null;
  }

  const candidate =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  if (!candidate || /[\r\n]/.test(candidate) || candidate.length > 64) {
    return null;
  }

  return candidate;
}

function getSubjectKey(normalizedCpf: string): LoginAttemptKey {
  return {
    key: `cpf:${hashLoginKey(normalizedCpf)}`,
    limit: LOGIN_RATE_LIMIT_MAX_SUBJECT_ATTEMPTS,
  };
}

function getAttemptKeys(request: Request, normalizedCpf: string): LoginAttemptKey[] {
  const keys: LoginAttemptKey[] = [
    getSubjectKey(normalizedCpf),
    {
      key: 'global:login',
      limit: LOGIN_RATE_LIMIT_MAX_GLOBAL_ATTEMPTS,
    },
  ];

  const trustedClientIp = getTrustedClientIp(request);
  if (trustedClientIp) {
    keys.push({
      key: `ip:${hashLoginKey(trustedClientIp)}`,
      limit: LOGIN_RATE_LIMIT_MAX_SOURCE_ATTEMPTS,
    });
  }

  return keys;
}

function getActiveBucket(key: string, now = Date.now()) {
  const bucket = loginAttempts.get(key);

  if (!bucket || bucket.resetAt <= now) {
    return null;
  }

  return bucket;
}

export function getLoginRateLimit(request: Request, normalizedCpf: string, now = Date.now()) {
  const blockedKey = getAttemptKeys(request, normalizedCpf).find((attemptKey) => {
    const bucket = getActiveBucket(attemptKey.key, now);
    return bucket ? bucket.count >= attemptKey.limit : false;
  });

  return {
    limited: Boolean(blockedKey),
    retryAfterSeconds: blockedKey
      ? Math.max(1, Math.ceil((getActiveBucket(blockedKey.key, now)!.resetAt - now) / 1000))
      : 0,
  };
}

export function recordLoginFailure(request: Request, normalizedCpf: string, now = Date.now()) {
  for (const { key } of getAttemptKeys(request, normalizedCpf)) {
    const bucket = getActiveBucket(key, now) ?? {
      count: 0,
      resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
    };

    bucket.count += 1;
    loginAttempts.set(key, bucket);
  }
}

export function clearLoginFailures(_request: Request, normalizedCpf: string) {
  const subjectKey = getSubjectKey(normalizedCpf);
  loginAttempts.delete(subjectKey.key);
}

export function resetLoginRateLimitForTests() {
  loginAttempts.clear();
}
