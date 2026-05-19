// Static-analysis smoke checks and unit tests for S4-01 notices API.
// Verifies CRUD endpoints, RBAC scoping, sanitization hooks, and expiry filtering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { sanitizeNoticeTitle, sanitizeNoticeContent } from '../src/lib/notices/sanitize';
import { buildScopeWhere, buildActiveWhere } from '../src/app/api/notices/_shared';
import type { AuthSession } from '../src/lib/auth/shared';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const SHARED = 'src/app/api/notices/_shared.ts';
const ROUTE = 'src/app/api/notices/route.ts';
const GLOBAL = 'src/app/api/notices/global/route.ts';
const FILTER = 'src/app/api/notices/filter/route.ts';
const ID_ROUTE = 'src/app/api/notices/[id]/route.ts';

// ── Shared helpers ────────────────────────────────────────────────────────────

test('_shared exports formatNotice, buildScopeWhere, buildActiveWhere', () => {
  const source = readSource(SHARED);
  assert.match(source, /export function formatNotice/);
  assert.match(source, /export function buildScopeWhere/);
  assert.match(source, /export function buildActiveWhere/);
});

test('formatNotice maps _id, cooperative_id, is_global', () => {
  const source = readSource(SHARED);
  assert.match(source, /_id/);
  assert.match(source, /cooperative_id/);
  assert.match(source, /is_global/);
});

test('buildActiveWhere uses expiresAt null OR gt now', () => {
  const source = readSource(SHARED);
  assert.match(source, /expiresAt.*null|null.*expiresAt/);
  assert.match(source, /gt.*new Date\(\)|expiresAt.*gt/);
});

test('buildScopeWhere returns empty for admin and OR filter for manager', () => {
  const source = readSource(SHARED);
  assert.match(source, /role.*admin|admin.*role/);
  assert.match(source, /cooperativeId.*null/);
  assert.match(source, /cooperativeId.*BigInt/);
});

// ── GET /api/notices ──────────────────────────────────────────────────────────

test('GET route uses requireManagerOrAdmin', () => {
  const source = readSource(ROUTE);
  assert.match(source, /requireManagerOrAdmin/);
});

test('GET route applies scope and active filters with AND', () => {
  const source = readSource(ROUTE);
  assert.match(source, /AND.*\[scopeWhere|AND.*\[buildScopeWhere/);
  assert.match(source, /buildScopeWhere/);
  assert.match(source, /buildActiveWhere/);
});

test('GET route orders by priority desc then createdAt desc', () => {
  const source = readSource(ROUTE);
  assert.match(source, /priority.*desc/);
  assert.match(source, /createdAt.*desc/);
});

// ── POST /api/notices ─────────────────────────────────────────────────────────

test('POST route sanitizes title and content', () => {
  const source = readSource(ROUTE);
  assert.match(source, /sanitizeNoticeTitle/);
  assert.match(source, /sanitizeNoticeContent/);
});

test('POST route validates priority between 1 and 5', () => {
  const source = readSource(ROUTE);
  assert.match(source, /priorityNum.*<.*1/);
  assert.match(source, /priorityNum.*>.*5/);
  assert.match(source, /Prioridade deve ser um inteiro entre 1 e 5/);
});

test('POST route rejects expires_at in the past', () => {
  const source = readSource(ROUTE);
  assert.match(source, /EXPIRES_AT_NOT_FUTURE|expiresAt.*<=.*new Date/);
});

test('POST route sets createdBy from session.workerId not body', () => {
  const source = readSource(ROUTE);
  assert.match(source, /session\.workerId/);
  assert.doesNotMatch(source, /createdBy.*body\.createdBy|body\.created_by/);
});

test('POST global notice requires global permission', () => {
  const source = readSource(ROUTE);
  assert.match(source, /requireScopedPermission.*global|global.*requireScopedPermission/);
});

test('POST cooperative notice checks manager owns coop', () => {
  const source = readSource(ROUTE);
  assert.match(source, /session\.cooperativeId/);
  assert.match(source, /FORBIDDEN/);
});

// ── GET /api/notices/global ───────────────────────────────────────────────────

test('global route filters cooperativeId = null', () => {
  const source = readSource(GLOBAL);
  assert.match(source, /cooperativeId.*null/);
});

test('global route applies active filter', () => {
  const source = readSource(GLOBAL);
  assert.match(source, /buildActiveWhere/);
});

// ── GET /api/notices/filter ───────────────────────────────────────────────────

test('filter route reads priority query param', () => {
  const source = readSource(FILTER);
  assert.match(source, /searchParams.*priority|priority.*searchParams/);
});

test('filter route returns 400 when priority missing', () => {
  const source = readSource(FILTER);
  assert.match(source, /MISSING_PRIORITY/);
});

test('filter route validates priority between 1 and 5', () => {
  const source = readSource(FILTER);
  assert.match(source, /INVALID_PRIORITY/);
  assert.match(source, /priority.*<.*1/);
  assert.match(source, /priority.*>.*5/);
  assert.match(source, /Prioridade deve ser um inteiro entre 1 e 5/);
});

test('filter route applies scope and active filters', () => {
  const source = readSource(FILTER);
  assert.match(source, /buildScopeWhere/);
  assert.match(source, /buildActiveWhere/);
});

// ── GET /api/notices/[id] ─────────────────────────────────────────────────────

test('GET [id] returns notice including expired (no active filter)', () => {
  const source = readSource(ID_ROUTE);
  assert.doesNotMatch(source, /buildActiveWhere/);
});

test('GET [id] uses scope filter', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /buildScopeWhere/);
});

// ── PATCH /api/notices/[id] ───────────────────────────────────────────────────

test('PATCH sanitizes title and content', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /sanitizeNoticeTitle/);
  assert.match(source, /sanitizeNoticeContent/);
});

test('PATCH blocks manager from editing global notice with 403', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /cooperativeId.*===.*null/);
  assert.match(source, /FORBIDDEN/);
});

test('PATCH blocks manager from cross-coop notice with 404', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /NOTICE_NOT_FOUND/);
});

test('PATCH updates lastUpdated timestamp', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /lastUpdated.*new Date|lastUpdated.*Date/);
});

test('PATCH validates priority between 1 and 5', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /p.*<.*1/);
  assert.match(source, /p.*>.*5/);
  assert.match(source, /Prioridade deve ser um inteiro entre 1 e 5/);
});

test('PATCH allows null expires_at to remove expiry', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /expiresAt.*null|null.*expiresAt/);
});

// ── DELETE /api/notices/[id] ──────────────────────────────────────────────────

test('DELETE blocks manager from deleting global notice with 403', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /FORBIDDEN/);
});

test('DELETE returns 204 on success', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /204/);
});

// ── XSS / sanitization surface ────────────────────────────────────────────────

test('XSS: sanitize-html import present in POST route', () => {
  const source = readSource(ROUTE);
  assert.match(source, /sanitize/);
});

test('XSS: sanitize-html import present in PATCH route', () => {
  const source = readSource(ID_ROUTE);
  assert.match(source, /sanitize/);
});

// ── Executable unit tests: sanitize functions ─────────────────────────────────

test('sanitizeNoticeTitle strips script tag and returns plain text', () => {
  const result = sanitizeNoticeTitle('<script>alert(1)</script>Aviso');
  assert.doesNotMatch(result, /<script/i);
  assert.match(result, /Aviso/);
});

test('sanitizeNoticeTitle strips img onerror XSS vector', () => {
  const result = sanitizeNoticeTitle('<img src=x onerror="alert(1)">Título');
  assert.doesNotMatch(result, /onerror/i);
  assert.doesNotMatch(result, /<img/i);
});

test('sanitizeNoticeTitle strips svg onload XSS vector', () => {
  const result = sanitizeNoticeTitle('<svg onload="alert(1)">x</svg>Título');
  assert.doesNotMatch(result, /onload/i);
  assert.doesNotMatch(result, /<svg/i);
});

test('sanitizeNoticeTitle strips anchor with javascript: href', () => {
  const result = sanitizeNoticeTitle('<a href="javascript:void(0)">click</a>');
  assert.doesNotMatch(result, /javascript:/i);
  assert.doesNotMatch(result, /<a/i);
});

test('sanitizeNoticeTitle returns empty string for script-only input', () => {
  const result = sanitizeNoticeTitle('<script>alert(1)</script>');
  assert.equal(result, '');
});

test('sanitizeNoticeContent allows safe tags', () => {
  const result = sanitizeNoticeContent('<p>Ola <strong>mundo</strong></p>');
  assert.match(result, /<p>/);
  assert.match(result, /<strong>/);
});

test('sanitizeNoticeContent strips onclick attribute', () => {
  const result = sanitizeNoticeContent('<p onclick="alert(1)">texto</p>');
  assert.doesNotMatch(result, /onclick/i);
});

test('sanitizeNoticeContent strips style attribute', () => {
  const result = sanitizeNoticeContent('<p style="color:red">texto</p>');
  assert.doesNotMatch(result, /style=/i);
});

test('sanitizeNoticeContent strips script XSS payload', () => {
  const result = sanitizeNoticeContent('<p>texto</p><script>alert(1)</script>');
  assert.doesNotMatch(result, /<script/i);
  assert.match(result, /texto/);
});

test('sanitizeNoticeContent strips img onerror', () => {
  const result = sanitizeNoticeContent('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(result, /onerror/i);
  assert.doesNotMatch(result, /<img/i);
});

// ── Executable unit tests: buildScopeWhere / buildActiveWhere ─────────────────

test('buildScopeWhere returns empty object for admin', () => {
  const session = { role: 'admin', cooperativeId: '1', workerId: '1', name: 'Admin' } as AuthSession;
  const result = buildScopeWhere(session);
  assert.deepEqual(result, {});
});

test('buildScopeWhere returns OR filter for manager including null coop', () => {
  const session = { role: 'manager', cooperativeId: '42', workerId: '1', name: 'Manager' } as AuthSession;
  const result = buildScopeWhere(session);
  assert.ok('OR' in result, 'Should have OR key');
  const orClauses = (result as { OR: Record<string, unknown>[] }).OR;
  const hasNull = orClauses.some((c) => c.cooperativeId === null);
  const hasCoop = orClauses.some((c) => c.cooperativeId === BigInt('42'));
  assert.ok(hasNull, 'Should include null cooperativeId clause');
  assert.ok(hasCoop, 'Should include own cooperativeId clause');
});

test('buildActiveWhere returns OR with null and gt now', () => {
  const result = buildActiveWhere();
  assert.ok('OR' in result, 'Should have OR key');
  const orClauses = (result as { OR: unknown[] }).OR;
  assert.equal(orClauses.length, 2);
  const asStr = JSON.stringify(orClauses);
  assert.match(asStr, /null/);
  assert.match(asStr, /gt/);
});
