// Static-analysis smoke checks for S3-06 collective sales UI page.
// Verifies tabs, RBAC-aware actions, reports discoverability, and scoping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/collective-sales/page.tsx';
const LAYOUT = 'src/components/Layout.tsx';

// ── Navigation ────────────────────────────────────────────────────────────────

test('Layout includes /collective-sales nav link', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /\/collective-sales/);
  assert.match(source, /Coletivas/);
});

// ── Page structure ────────────────────────────────────────────────────────────

test('page exports default CollectiveSalesPage function', () => {
  const source = readSource(PAGE);
  assert.match(source, /export default function CollectiveSalesPage/);
});

test('page uses Layout with activePath /collective-sales', () => {
  const source = readSource(PAGE);
  assert.match(source, /activePath="\/collective-sales"/);
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

test('page has ACTIVE tab for active sales', () => {
  const source = readSource(PAGE);
  assert.match(source, /ACTIVE/);
  assert.match(source, /Ativas/);
});

test('page has INVITED tab for pending invitations', () => {
  const source = readSource(PAGE);
  assert.match(source, /INVITED/);
  assert.match(source, /Convites/);
});

test('page has SOLD tab for completed sales', () => {
  const source = readSource(PAGE);
  assert.match(source, /SOLD/);
  assert.match(source, /Conclu/);
});

test('page has CANCELLED tab for cancelled sales', () => {
  const source = readSource(PAGE);
  assert.match(source, /CANCELLED/);
  assert.match(source, /Canceladas/);
});

// ── API calls ─────────────────────────────────────────────────────────────────

test('page fetches /api/collective-sales with status param', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/collective-sales\?status=/);
});

test('page fetches /api/collective-sales/invitations', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/collective-sales\/invitations/);
});

test('page posts to /api/collective-sales to create sale', () => {
  const source = readSource(PAGE);
  assert.match(source, /handleCreate/);
  assert.match(source, /\/api\/collective-sales'/);
});

test('page posts to invite endpoint', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/invite/);
  assert.match(source, /cooperative_id/);
});

test('page patches contribution endpoint with contributed_weight', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/contribution/);
  assert.match(source, /contributed_weight/);
});

test('page posts to join endpoint', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmJoin|action.*join|join.*action/);
});

test('page posts to leave endpoint', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmLeave|action.*leave|leave.*action/);
});

test('page posts to cancel endpoint', () => {
  const source = readSource(PAGE);
  assert.match(source, /cancel.*path|path.*cancel|confirmCancel/);
});

test('page posts to complete endpoint', () => {
  const source = readSource(PAGE);
  assert.match(source, /complete.*path|path.*complete|'complete'/);
});

// ── RBAC-aware actions ────────────────────────────────────────────────────────

test('page checks isCreator before showing invite/complete/cancel buttons', () => {
  const source = readSource(PAGE);
  assert.match(source, /isCreator/);
  assert.match(source, /creator_cooperative_id.*myCoopId|myCoopId.*creator_cooperative_id/);
});

test('page checks isParticipant before showing contribute/leave buttons', () => {
  const source = readSource(PAGE);
  assert.match(source, /isParticipant/);
  assert.match(source, /my_participation/);
});

// ── Confirmation dialogs ──────────────────────────────────────────────────────

test('complete action shows revenue impact in confirmation dialog', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmComplete/);
  assert.match(source, /Receita estimada/);
});

test('cancel action shows stock return message in confirmation dialog', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmCancel/);
  assert.match(source, /devolvido ao estoque/);
});

test('leave action shows stock impact message in confirmation dialog', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmLeave/);
  assert.match(source, /devolvido ao estoque/);
});

// ── Reports discoverability ───────────────────────────────────────────────────

test('page links to /api/reports/sales/collective JSON report', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/reports\/sales\/collective\//);
});

test('page links to /api/reports/pdf/collective-sale PDF download', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/reports\/pdf\/collective-sale\//);
});

test('PDF link uses download attribute', () => {
  const source = readSource(PAGE);
  assert.match(source, /download/);
});

// ── Participants panel ────────────────────────────────────────────────────────

test('page shows participant list with contributed_weight and revenue_share', () => {
  const source = readSource(PAGE);
  assert.match(source, /contributed_weight/);
  assert.match(source, /revenue_share|Revenue share/);
});

test('page expands participant details on row click', () => {
  const source = readSource(PAGE);
  assert.match(source, /expandedSaleId/);
  assert.match(source, /Participantes/);
});

// ── Scope guard ───────────────────────────────────────────────────────────────

test('page reads myCoopId from localStorage user.cooperative_id', () => {
  const source = readSource(PAGE);
  assert.match(source, /cooperative_id/);
  assert.match(source, /localStorage.*user|user.*localStorage/);
});
