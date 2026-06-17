import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('orphan measurement reconciliation script is dry-run first and skips existing stock', () => {
  const source = readFileSync(
    path.resolve('scripts/reconcile-orphan-measurements-stock.ts'),
    'utf8',
  );

  assert.match(source, /--cooperative-id/);
  assert.match(source, /--from/);
  assert.match(source, /--to/);
  assert.match(source, /--apply/);
  assert.match(source, /dryRun: !args\.apply/);
  assert.match(source, /needs_manual_review/);
  assert.match(source, /existingStock/);
  assert.match(source, /calculateBagStateDelta/);
  assert.match(source, /addToStock/);
});
