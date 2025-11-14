import { Decimal } from '@prisma/client/runtime/library';

export function decodeBytes(value: Buffer | Uint8Array | null | undefined) {
  if (!value) return '';
  if (value instanceof Buffer) {
    return value.toString('utf8');
  }
  return Buffer.from(value).toString('utf8');
}

export function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function toBigIntId(value: string) {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function formatWorkerId(workerId: bigint) {
  const idNumber = Number(workerId);
  if (Number.isNaN(idNumber)) {
    return workerId.toString();
  }
  return `WP${idNumber.toString().padStart(3, '0')}`;
}

export function mapUserType(rawType: string | null | undefined) {
  if (!rawType) return null;
  const normalized = rawType.trim().toUpperCase();

  if (/^\d$/.test(normalized)) {
    return Number(normalized);
  }

  if (normalized === 'M' || normalized === 'A') {
    return 0;
  }

  if (normalized === 'W' || normalized === 'C') {
    return 1;
  }

  return null;
}

export function decimalToNumber(value: Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number(value);
}

