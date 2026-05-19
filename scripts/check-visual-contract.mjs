import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const explicitFiles = process.argv.slice(2);

const canonicalFrontendFiles = [
  'src/app/globals.css',
  'src/app/layout.tsx',
  'src/app/login/page.tsx',
  'src/app/page.tsx',
  'src/components/Layout.tsx',
  'tailwind.config.ts',
];

const forbiddenPatterns = [
  { pattern: /#00D4FF/i, label: 'legacy neon ciano color' },
  { pattern: /#FF00D4/i, label: 'legacy neon rosa color' },
  { pattern: /\bdms-chart-(green|teal|forest|olive)/i, label: 'legacy green chart token' },
  { pattern: /\b(bg|text|border|ring|from|to|via)-(white|black|gray|slate|zinc|neutral|stone|red|green|blue|orange|purple)(?:\b|-)/i, label: 'raw Tailwind palette class outside contract tokens' },
  { pattern: /\btracking-/i, label: 'local letter-spacing class' },
  { pattern: /radial-gradient/i, label: 'decorative radial gradient' },
  { pattern: /shadow-\[/i, label: 'inline shadow outside token system' },
];

const allowedHexValues = new Set([
  '#0A0E1A',
  '#00FF88',
  '#1A1F2E',
  '#1F2536',
  '#243049',
  '#2A3441',
  '#65708D',
  '#94A3C7',
  '#F5F8FF',
  '#FF4D6D',
  '#FF6B35',
  '#FFD700',
  '#C15079',
  '#7A1C44',
  '#A03D63',
  '#F8EEF1',
  '#C74B6F',
  '#8A2736',
  '#5C1D2E',
  '#2D0D17',
  '#F7E4E4',
]);

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

function changedFrontendFiles() {
  const pathspecs = ['src', 'tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs'];
  const tracked = runGit([
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    '--ignore-all-space',
    'HEAD',
    '--',
    ...pathspecs,
  ]);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]);
  return [...new Set([...tracked, ...untracked])];
}

const defaultFiles = [...new Set([...canonicalFrontendFiles, ...changedFrontendFiles()])];

const files = (explicitFiles.length ? explicitFiles : defaultFiles)
  .filter((file) => /\.(css|tsx?|jsx?)$/.test(file))
  .filter((file) => existsSync(file));

const findings = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const hexMatches = line.match(/#[0-9A-Fa-f]{6,8}\b/g) || [];
    hexMatches.forEach((hex) => {
      if (!allowedHexValues.has(hex.toUpperCase())) {
        findings.push({ file, line: index + 1, label: `non-contract color ${hex}`, text: line.trim() });
      }
    });

    forbiddenPatterns.forEach(({ pattern, label }) => {
      if (pattern.test(line)) {
        findings.push({ file, line: index + 1, label, text: line.trim() });
      }
    });
  });
}

if (findings.length) {
  console.error('Visual contract check failed. Use semantic tokens from .tony/design.md or document an ADR exception.');
  findings.forEach((finding) => {
    console.error(`${finding.file}:${finding.line} - ${finding.label}: ${finding.text}`);
  });
  process.exit(1);
}

const scope = files.length ? files.map((file) => path.relative(process.cwd(), file)).join(', ') : 'no changed frontend files';
console.log(`Visual contract check passed for ${scope}.`);
