// Static-analysis smoke checks for S3-02 collective sales routes.
// Verifies structural invariants: auth, RBAC, stock integration, error codes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

// ── PATCH /api/collective-sales/[id] ────────────────────────────────────────

test('sale edit requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('sale edit enforces creator-only rule', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /EDIT_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
});

test('sale edit blocks changes on closed sales', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /COLLECTIVE_SALE_CLOSED/);
  assert.match(source, /soldAt/);
  assert.match(source, /cancelledAt/);
});

test('sale edit blocks material change when reservations exist', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /MATERIAL_CHANGE_BLOCKED/);
  assert.match(source, /contributedWeight/);
  assert.match(source, /ACCEPTED/);
});

test('sale edit returns 404 MATERIAL_NOT_FOUND on P2025', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /P2025/);
  assert.match(source, /MATERIAL_NOT_FOUND/);
});

test('sale edit returns updated sale fields in response', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/route.ts');
  assert.match(source, /material_id/);
  assert.match(source, /price\/kg/);
  assert.match(source, /collective_sale:/);
});

// ── PATCH /api/collective-sales/[id]/contribution ───────────────────────────

test('contribution update requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('contribution update uses lockStockAggregateForUpdate for concurrency safety', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /lockStockAggregateForUpdate/);
  assert.match(source, /\$transaction/);
});

test('contribution update calls adjustStock with computed delta', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /adjustStock/);
  assert.match(source, /delta/);
  assert.match(source, /minus/);
});

test('contribution update rejects non-ACCEPTED participants', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /CONTRIBUTION_NOT_ACCEPTED/);
});

test('contribution update rejects non-participants', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /NOT_A_PARTICIPANT/);
});

test('contribution update blocks updates on closed sales', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /COLLECTIVE_SALE_CLOSED/);
});

test('contribution update validates contributed_weight >= 0', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/contribution/route.ts');
  assert.match(source, /parseNonNegativeDecimal2/);
  assert.match(source, /INVALID_CONTRIBUTED_WEIGHT/);
});

// ── POST /api/collective-sales/[id]/leave ───────────────────────────────────

test('leave requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('leave blocks creator from leaving own collective sale', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /LEAVE_CREATOR_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
});

test('leave transitions contribution status to LEFT', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /status.*LEFT/);
  assert.match(source, /collectiveSaleContribution\.update/);
});

test('leave returns reserved stock via adjustStock', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /adjustStock/);
  assert.match(source, /negated/);
  assert.match(source, /contributedWeight/);
});

test('leave is idempotent when already LEFT', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /já saiu/);
  assert.match(source, /LEFT/);
});

test('leave blocks leaving a closed collective sale', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /COLLECTIVE_SALE_CLOSED/);
});

test('leave rejects when cooperative is not a participant', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/leave/route.ts');
  assert.match(source, /NOT_A_PARTICIPANT/);
});

// ── POST /api/collective-sales/[id]/cancel ──────────────────────────────────

test('cancel requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('cancel enforces creator-only rule', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /CANCEL_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
});

test('cancel is idempotent when already cancelled', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /já cancelada/);
  assert.match(source, /cancelledAt/);
});

test('cancel blocks cancelling a sold sale', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /COLLECTIVE_SALE_SOLD/);
  assert.match(source, /soldAt/);
});

test('cancel returns all ACCEPTED reserved stock via adjustStock', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /adjustStock/);
  assert.match(source, /negated/);
  assert.match(source, /status.*ACCEPTED/);
  assert.match(source, /contributedWeight/);
});

test('cancel sets cancelledAt timestamp', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /cancelledAt.*new Date/);
  assert.match(source, /collectiveSale\.update/);
});

test('cancel runs stock returns and status update in a single transaction', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/cancel/route.ts');
  assert.match(source, /\$transaction/);
});
