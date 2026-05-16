// Static-analysis smoke checks for collective sales API routes (S3-01).
// Verifies structural invariants: auth, RBAC, participation integrity, error codes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readRoute(routePath: string) {
  return readFileSync(path.resolve(routePath), 'utf8');
}

// ── GET + POST /api/collective-sales ────────────────────────────────────────

test('collective-sales list requires manager/admin — workers are blocked', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('collective-sales list uses sales.read scope', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /requireScopedPermission/);
  assert.match(source, /'sales',\s*'read'/);
});

test('collective-sales list filters by cooperative participation for manager role', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /creatorCooperativeId/);
  assert.match(source, /contributions/);
  assert.match(source, /some.*cooperativeId/);
  assert.match(source, /status.*ACCEPTED/);
});

test('collective-sales list exposes my_participation field in response', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /my_participation/);
});

test('collective-sales create requires manager/admin with sales.create scope', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'create'/);
});

test('collective-sales create auto-enrolls creator as ACCEPTED participant', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /contributions/);
  assert.match(source, /status.*ACCEPTED/);
  assert.match(source, /creatorCooperativeId/);
});

test('collective-sales create resolves buyer by name with find-or-create pattern', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /buyers\.findFirst/);
  assert.match(source, /buyers\.create/);
  assert.match(source, /P2002/);
});

test('collective-sales create returns 201 with collective_sale in body', () => {
  const source = readRoute('src/app/api/collective-sales/route.ts');
  assert.match(source, /status:\s*201/);
  assert.match(source, /collective_sale:/);
});

// ── GET /api/collective-sales/invitations ───────────────────────────────────

test('invitations list requires manager/admin', () => {
  const source = readRoute('src/app/api/collective-sales/invitations/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.doesNotMatch(source, /requireAuth\(\)/);
});

test('invitations list filters PENDING status and open sales only', () => {
  const source = readRoute('src/app/api/collective-sales/invitations/route.ts');
  assert.match(source, /status.*PENDING/);
  assert.match(source, /soldAt.*null/);
  assert.match(source, /cancelledAt.*null/);
});

test('invitations list response includes creator_cooperative_id', () => {
  const source = readRoute('src/app/api/collective-sales/invitations/route.ts');
  assert.match(source, /creator_cooperative_id/);
  assert.match(source, /COLLECTIVE_SALE_INVITATIONS_READ_FAILED/);
});

// ── POST /api/collective-sales/[id]/invite ──────────────────────────────────

test('invite requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('invite blocks creator from inviting own cooperative', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /INVITE_SELF_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId/);
});

test('invite enforces creator-only rule — non-creator managers are forbidden', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /INVITE_FORBIDDEN/);
  assert.match(source, /creatorCooperativeId\.toString\(\)/);
  assert.match(source, /session\.cooperativeId/);
});

test('invite returns 409 for duplicate invitation via P2002', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /P2002/);
  assert.match(source, /INVITE_DUPLICATE/);
});

test('invite creates contribution with PENDING status', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /collectiveSaleContribution\.create/);
  assert.match(source, /status.*PENDING/);
});

test('invite blocks inviting into a closed collective sale', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/invite/route.ts');
  assert.match(source, /COLLECTIVE_SALE_CLOSED/);
  assert.match(source, /soldAt/);
  assert.match(source, /cancelledAt/);
});

// ── POST /api/collective-sales/[id]/join ────────────────────────────────────

test('join requires manager/admin with sales.update scope', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /requireManagerOrAdmin/);
  assert.match(source, /'sales',\s*'update'/);
});

test('join transitions contribution from PENDING to ACCEPTED', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /collectiveSaleContribution\.update/);
  assert.match(source, /status.*ACCEPTED/);
});

test('join is idempotent when already ACCEPTED', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /já é participante/);
  assert.match(source, /idempotent/);
});

test('join rejects when no invitation exists for cooperative', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /INVITE_NOT_FOUND/);
  assert.match(source, /collectiveSaleContribution\.findUnique/);
});

test('join blocks joining a closed collective sale', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /COLLECTIVE_SALE_CLOSED/);
});

test('join uses composite unique key collectiveSaleId_cooperativeId', () => {
  const source = readRoute('src/app/api/collective-sales/[id]/join/route.ts');
  assert.match(source, /collectiveSaleId_cooperativeId/);
});
