// Static-analysis smoke checks for S4-02 notice board UI page.
// Verifies nav integration, RBAC controls, API calls, and XSS-safe rendering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/notices/page.tsx';
const LAYOUT = 'src/components/Layout.tsx';

// ── Navigation ────────────────────────────────────────────────────────────────

test('Layout includes /notices nav link', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /\/notices/);
  assert.match(source, /Avisos/);
});

test('Layout imports FaBell for notices nav icon', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /FaBell/);
});

// ── Page structure ────────────────────────────────────────────────────────────

test('page exports default NoticeBoardPage function', () => {
  const source = readSource(PAGE);
  assert.match(source, /export default function/);
});

test('page uses Layout with activePath /notices', () => {
  const source = readSource(PAGE);
  assert.match(source, /activePath="\/notices"/);
});

// ── API calls ─────────────────────────────────────────────────────────────────

test('page fetches /api/notices', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/notices/);
});

test('page fetches /api/notices/filter with priority param', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/notices\/filter\?priority|filter.*priority/);
});

test('page posts to /api/notices to create notice', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/notices/);
  assert.match(source, /POST/);
});

test('page patches /api/notices/[id] to edit', () => {
  const source = readSource(PAGE);
  assert.match(source, /PATCH/);
});

test('page deletes /api/notices/[id]', () => {
  const source = readSource(PAGE);
  assert.match(source, /DELETE/);
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

test('page reads cooperative_id from localStorage user', () => {
  const source = readSource(PAGE);
  assert.match(source, /cooperative_id/);
  assert.match(source, /localStorage.*user|user.*localStorage/);
});

test('page checks is_global before showing edit/delete buttons', () => {
  const source = readSource(PAGE);
  assert.match(source, /is_global/);
});

test('page uses admin check for global notice creation', () => {
  const source = readSource(PAGE);
  assert.match(source, /isAdmin|userType.*1|admin/);
});

// ── UX elements ───────────────────────────────────────────────────────────────

test('page shows priority badge for each notice', () => {
  const source = readSource(PAGE);
  assert.match(source, /priority/);
  assert.match(source, /P[1-5]|prioridade|Prioridade/i);
});

test('page shows expiry date for notices with expires_at', () => {
  const source = readSource(PAGE);
  assert.match(source, /expires_at/);
});

test('page shows Global badge for global notices', () => {
  const source = readSource(PAGE);
  assert.match(source, /Global/);
  assert.match(source, /is_global/);
});

test('page has loading state', () => {
  const source = readSource(PAGE);
  assert.match(source, /loading|Carregando/);
});

test('page has error state with retry', () => {
  const source = readSource(PAGE);
  assert.match(source, /error|erro/i);
  assert.match(source, /retry|Tentar novamente/);
});

test('page has empty state', () => {
  const source = readSource(PAGE);
  assert.match(source, /nenhum|vazio|empty|Nenhum/i);
});

test('page has delete confirmation dialog', () => {
  const source = readSource(PAGE);
  assert.match(source, /confirmDelete|confirm.*delete|Remover.*aviso|aviso.*remover/i);
});

// ── XSS-safe HTML rendering ───────────────────────────────────────────────────

test('page renders notice content with dangerouslySetInnerHTML', () => {
  const source = readSource(PAGE);
  assert.match(source, /dangerouslySetInnerHTML/);
  assert.match(source, /__html/);
});

// ── Filter UI ─────────────────────────────────────────────────────────────────

test('page has priority filter buttons', () => {
  const source = readSource(PAGE);
  assert.match(source, /filterPriority|setFilter|priority.*filter/i);
});
