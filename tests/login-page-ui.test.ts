import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

test('modal width utilities are not shadowed by custom spacing tokens', () => {
  const globals = readSource('src/app/globals.css');
  const login = readSource('src/app/login/page.tsx');
  const notices = readSource('src/app/notices/page.tsx');

  assert.doesNotMatch(globals, /--spacing-(?:xxs|xs|sm|md|lg|xl|xxl|2xl):/);
  assert.match(login, /surface-panel w-full max-w-md/);
  assert.match(notices, /w-full max-w-2xl max-h-\[90vh\] overflow-y-auto/);
  assert.match(notices, /w-full max-w-md/);
  assert.doesNotMatch(
    notices,
    /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-y)-(?:xxs|xs|sm|md|lg|xl|xxl)\b/,
  );
});
