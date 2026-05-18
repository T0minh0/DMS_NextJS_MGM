import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testRoot = path.resolve('tests');
const tsxCommand = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTestFiles(fullPath);
    }

    return /\.test\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

const files = collectTestFiles(testRoot).sort();

if (!files.length) {
  console.error('No test files found under tests/**/*.test.ts(x).');
  process.exit(1);
}

const result = spawnSync(tsxCommand, ['--test', ...files], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
