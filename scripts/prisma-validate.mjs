import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://dms:dms@localhost:5432/dms?schema=public',
};

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(npxCommand, ['prisma', 'validate'], {
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
