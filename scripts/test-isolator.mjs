import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testRoot = path.resolve('tests');

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(fullPath);
    }
    return /\.test\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://dms:dms@localhost:5432/dms?schema=public',
  JWT_SECRET: 'local-quality-jwt-secret-with-at-least-32-characters',
};

const files = collectTestFiles(testRoot).sort();

for (const file of files) {
  console.log(`Running: ${path.basename(file)}...`);
  const result = spawnSync('node', ['--import', 'tsx', '--test', file], { env, stdio: 'inherit' });
  if (result.status !== 0) {
    if (result.error) {
      console.error('Spawn error:', result.error);
    }
    console.error(`❌ Test failed: ${path.basename(file)} (status: ${result.status})`);
    process.exit(1);
  }
}

console.log('✅ All tests passed individually!');
