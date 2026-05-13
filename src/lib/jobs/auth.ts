import { timingSafeEqual } from 'node:crypto';
import { getJobSecret, type JobEnv } from './config';

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyJobAuthorizationHeader(
  authorizationHeader: string | null | undefined,
  env: JobEnv = process.env,
) {
  const secret = getJobSecret(env);

  if (!secret || !authorizationHeader?.startsWith('Bearer ')) {
    return false;
  }

  return safeEqual(authorizationHeader, `Bearer ${secret}`);
}
