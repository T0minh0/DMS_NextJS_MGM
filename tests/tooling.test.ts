import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runWhitespaceCheck(file: string) {
  return spawnSync(process.execPath, ['scripts/check-whitespace.mjs', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function withTempFile(name: string, content: string, callback: (file: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'dms-whitespace-'));
  const file = path.join(directory, name);

  try {
    writeFileSync(file, content, 'utf8');
    callback(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('whitespace checker catches trailing spaces before CRLF endings', () => {
  withTempFile('bad.md', 'ok\r\nbad \r\n', (file) => {
    const result = runWhitespaceCheck(file);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bad\.md:2: trailing whitespace/);
  });
});

test('whitespace checker accepts clean CRLF files', () => {
  withTempFile('good.md', 'ok\r\nclean\r\n', (file) => {
    const result = runWhitespaceCheck(file);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Whitespace check passed/);
  });
});
