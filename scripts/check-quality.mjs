import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const qualityEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://dms:dms@localhost:5432/dms?schema=public',
  JWT_SECRET:
    process.env.JWT_SECRET ||
    'local-quality-jwt-secret-with-at-least-32-characters',
};

const steps = [
  ['Lint', npmCommand, ['run', 'lint']],
  ['Typecheck', npmCommand, ['run', 'typecheck']],
  ['Unit tests', npmCommand, ['test']],
  ['Prisma schema', npmCommand, ['run', 'prisma:validate']],
  ['Visual contract', npmCommand, ['run', 'check:visual-contract']],
  ['Production build', npmCommand, ['run', 'build']],
  ['Whitespace diff', npmCommand, ['run', 'check:whitespace']],
];

for (const [label, command, args] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, { env: qualityEnv, stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(`\nQuality gate failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll quality gates passed.');
