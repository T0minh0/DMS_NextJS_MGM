import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
const actions = new Set([
  'forgot-password',
  'reset-password',
  'verify-recovery-email',
  'login',
  'assisted-recovery',
]);
export function recoveryApiUrl(
  action: string,
  base: string | undefined,
  production: boolean,
): string {
  if (!actions.has(action)) throw new Error('Operação não permitida.');
  if (!base) throw new Error('Serviço de recuperação não configurado.');
  const url = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' &&
      (production || !local || url.protocol !== 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new Error('Origem inválida.');
  return new URL(`/auth/${action}`, url.origin).toString();
}
export function sameOrigin(origin: string | null, trusted: string): boolean {
  try {
    return (
      origin !== null && new URL(origin).origin === new URL(trusted).origin
    );
  } catch {
    return false;
  }
}
export function publicRecoveryPayload(
  action: string,
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Dados inválidos.');
  const data = value as Record<string, unknown>;
  const field = (name: string, max: number) => {
    const v = data[name];
    if (typeof v !== 'string' || !v || v.length > max)
      throw new Error('Confira os campos preenchidos.');
    return v;
  };
  if (action === 'forgot-password') return { cpf: field('cpf', 32) };
  if (action === 'verify-recovery-email') return { token: field('token', 256) };
  if (action === 'reset-password')
    return {
      token: field('token', 256),
      newPassword: field('newPassword', 128),
    };
  throw new Error('Operação não permitida.');
}
export async function callMobileAuth(
  action: string,
  payload: unknown,
  token?: string,
  clientIp?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = recoveryApiUrl(
    action,
    process.env.DMS_MOBILE_API_URL,
    process.env.NODE_ENV === 'production',
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clientIp
        ? clientIpHeaders(
            'POST',
            new URL(url).pathname,
            clientIp,
            process.env.AUTH_PROXY_SECRET,
            Math.floor(Date.now() / 1000),
          )
        : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const body = await response
    .json()
    .catch(() => ({ message: 'Não foi possível concluir. Tente novamente.' }));
  return { status: response.status, body };
}

export function clientIpHeaders(
  method: string,
  path: string,
  ip: string,
  secret: string | undefined,
  time: number,
): Record<string, string> {
  if (!isIP(ip) || !secret || secret.length < 32)
    throw new Error('Encaminhamento não configurado.');
  const canonical =
    isIP(ip) === 6
      ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase()
      : ip;
  const timestamp = String(time);
  return {
    'x-dms-client-ip': canonical,
    'x-dms-client-time': timestamp,
    'x-dms-client-signature': createHmac('sha256', secret)
      .update(`${timestamp}\n${method}\n${path}\n${canonical}`)
      .digest('hex'),
  };
}
export function trustedClientIp(request: Request): string | undefined {
  if (process.env.NODE_ENV !== 'production' && !process.env.AUTH_PROXY_SECRET)
    return undefined;
  const header = process.env.DMS_CLIENT_IP_HEADER;
  const ip = header ? request.headers.get(header)?.trim() : null;
  if (!ip || !isIP(ip) || !process.env.AUTH_PROXY_SECRET)
    throw new Error('Origem de rede não configurada.');
  return ip;
}
