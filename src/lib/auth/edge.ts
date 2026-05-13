import { getJwtSecret } from './secret';
import {
  AUTH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  AuthTokenPayload,
  normalizeAuthPayload,
} from './shared';

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeJsonPart(value: string) {
  const decoded = new TextDecoder().decode(decodeBase64Url(value));
  return JSON.parse(decoded) as Record<string, unknown>;
}

function tokenIsFresh(payload: AuthTokenPayload) {
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp <= now) {
    return false;
  }

  if (payload.nbf && payload.nbf > now) {
    return false;
  }

  return true;
}

export async function verifyAuthTokenEdge(token: string) {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJsonPart(headerPart);

    if (header.alg !== 'HS256') {
      return null;
    }

    const payload = normalizeAuthPayload(decodeJsonPart(payloadPart));

    if (!payload || payload.iss !== AUTH_TOKEN_ISSUER || payload.aud !== AUTH_TOKEN_AUDIENCE) {
      return null;
    }

    if (!tokenIsFresh(payload)) {
      return null;
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(getJwtSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const signature = decodeBase64Url(signaturePart);
    const verified = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );

    return verified ? payload : null;
  } catch {
    return null;
  }
}
