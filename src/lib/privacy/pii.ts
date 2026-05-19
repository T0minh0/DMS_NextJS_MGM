export function digitsOnly(value: string | null | undefined) {
  return value?.replace(/\D/g, '') ?? '';
}

export function normalizeCpfDigits(value: string | null | undefined) {
  const digits = digitsOnly(value);
  return digits.length === 11 ? digits : null;
}

export function normalizePisDigits(value: string | null | undefined) {
  const digits = digitsOnly(value);
  return digits.length === 11 ? digits : null;
}

export function normalizeRgDigits(value: string | null | undefined) {
  const digits = digitsOnly(value);
  return digits.length >= 8 && digits.length <= 9 ? digits : null;
}

export function normalizePhoneValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function maskDigits(value: string, visibleDigits = 2) {
  const digits = digitsOnly(value);
  if (!digits) {
    return '';
  }

  if (digits.length <= visibleDigits) {
    return '*'.repeat(digits.length);
  }

  return `${'*'.repeat(digits.length - visibleDigits)}${digits.slice(-visibleDigits)}`;
}

export function maskCpf(value: string | null | undefined) {
  const masked = maskDigits(value ?? '', 2);
  if (masked.length !== 11) {
    return masked;
  }

  return `${masked.slice(0, 3)}.${masked.slice(3, 6)}.${masked.slice(6, 9)}-${masked.slice(9)}`;
}

export function maskPis(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) {
    return '';
  }

  if (digits.length !== 11) {
    return maskDigits(digits, 1);
  }

  return `***.*****.**-${digits.slice(-1)}`;
}

export function maskRg(value: string | null | undefined) {
  return maskDigits(value ?? '', 2);
}
