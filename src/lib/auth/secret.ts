const DEVELOPMENT_JWT_SECRET = 'dms-dashboard-local-development-secret';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (secret) {
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      throw new Error('JWT_SECRET must have at least 32 characters in production');
    }

    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }

  return DEVELOPMENT_JWT_SECRET;
}
