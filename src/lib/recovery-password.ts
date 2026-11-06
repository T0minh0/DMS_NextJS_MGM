import { validNewPassword } from './auth/password';
export function recoveryPasswordError(
  password: string,
  confirmation: string,
): string | null {
  if (password !== confirmation) return 'Digite a mesma senha nos dois campos.';
  if (new TextEncoder().encode(password).byteLength > 72)
    return 'Use uma senha com até 72 bytes.';
  if (!validNewPassword(password, 'worker'))
    return /^\d+$/.test(password)
      ? 'Use 8 números. Evite todos os números iguais ou uma sequência como 12345678.'
      : 'Use pelo menos 6 caracteres na senha.';
  return null;
}
