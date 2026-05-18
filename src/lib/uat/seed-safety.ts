const LOCAL_SEED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const PRODUCTION_MARKERS = ['prod', 'production', 'prd'];
const DISPOSABLE_MARKERS = [
  'uat',
  'dev',
  'test',
  'local',
  'preview',
  'sandbox',
  'tmp',
  'scratch',
  'seed',
];

function hasMarker(value: string, markers: string[]) {
  const normalized = value.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

function hasSegmentMarker(value: string, markers: string[]) {
  const normalized = value.toLowerCase();
  return markers.some((marker) => {
    const pattern = new RegExp(`(^|[._/-])${marker}([._/-]|$)`);
    return pattern.test(normalized);
  });
}

export function assertSafeSeedTarget(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set before running the UAT seed.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const host = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const userName = parsed.username.toLowerCase();
  const descriptors = [host, databaseName, userName];
  const disposableDescriptors = [databaseName, userName];
  const allowRemote = process.env.DMS_ALLOW_REMOTE_UAT_SEED === 'true';

  if (descriptors.some((descriptor) => hasMarker(descriptor, PRODUCTION_MARKERS))) {
    throw new Error('Refusing to seed a database that looks like production.');
  }

  if (
    !disposableDescriptors.some((descriptor) =>
      hasSegmentMarker(descriptor, DISPOSABLE_MARKERS),
    )
  ) {
    throw new Error(
      'Refusing to seed a database without an explicit disposable marker in the database or user name, such as uat, dev, test, local, preview, sandbox, tmp, scratch or seed.',
    );
  }

  if (!allowRemote && !LOCAL_SEED_HOSTS.has(host)) {
    throw new Error(
      'Refusing to seed a non-local database. Set DMS_ALLOW_REMOTE_UAT_SEED=true only for disposable preview databases.',
    );
  }
}
