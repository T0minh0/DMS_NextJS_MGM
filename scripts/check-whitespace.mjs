import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const textFilePattern = /\.(css|cjs|js|jsx|json|md|mjs|prisma|sql|ts|tsx|txt|yml|yaml)$/;
const ignoredPathPattern = /^(?:\.git|\.next|coverage|dist|node_modules|out|Web_vault\/\.obsidian)\//;
const trailingWhitespacePattern = /[ \t]+(?:\r)?$/;

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function candidateFiles(files = process.argv.slice(2)) {
  if (files.length) {
    return files
      .filter((file) => textFilePattern.test(file))
      .filter((file) => !ignoredPathPattern.test(file))
      .filter((file) => existsSync(file));
  }

  const tracked = runGit(['ls-files']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']);

  return [...new Set([...tracked, ...untracked])]
    .filter((file) => textFilePattern.test(file))
    .filter((file) => !ignoredPathPattern.test(file))
    .filter((file) => existsSync(file));
}

const findings = [];

for (const file of candidateFiles()) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    if (trailingWhitespacePattern.test(line)) {
      findings.push(`${file}:${index + 1}: trailing whitespace`);
    }
  });
}

if (findings.length) {
  console.error('Whitespace check failed:');
  findings.forEach((finding) => console.error(finding));
  process.exit(1);
}

console.log('Whitespace check passed.');
