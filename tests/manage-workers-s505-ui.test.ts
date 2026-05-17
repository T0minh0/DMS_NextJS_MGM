import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeCpfDigits,
  normalizePisDigits,
  normalizeRgDigits,
} from '../src/lib/privacy/pii';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const MANAGE_WORKERS_PAGE = 'src/app/manage-workers/page.tsx';
const USERS_ROUTE = 'src/app/api/users/route.ts';
const USER_ROUTE = 'src/app/api/user/route.ts';
const USER_UPDATE_ROUTE = 'src/app/api/users/update/route.ts';
const PROFILE_UPDATE_ROUTE = 'src/app/api/user/update/route.ts';
const USERS_CREATE_ROUTE = 'src/app/api/users/create/route.ts';
const USERS_DELETE_ROUTE = 'src/app/api/users/delete/route.ts';
const USERS_DOCS = 'Web_vault/API/Usuarios.md';

test('S5-05 team page uses server session and team-management API view', () => {
  const source = readSource(MANAGE_WORKERS_PAGE);

  assert.match(source, /fetch\('\/api\/auth\/session'\)/);
  assert.match(source, /fetch\('\/api\/users\?view=team-management'\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\('user'\)/);
  assert.doesNotMatch(source, /console\.(log|error|warn|debug)/);
});

test('S5-05 team page keeps PII masked until an explicit reveal action', () => {
  const source = readSource(MANAGE_WORKERS_PAGE);

  assert.match(source, /documentsRevealed/);
  assert.match(source, /reveal=documents/);
  assert.match(source, /Revelar para editar/);
  assert.match(source, /Dados sensíveis expostos nesta sessão/);
  assert.match(source, /documentsLocked/);
  assert.match(source, /if \(documentsRevealed\) \{\s*payload\.PIS = pis;\s*payload\.RG = rg;\s*\}/);
});

test('S5-05 team page has inline validation and no native destructive confirm', () => {
  const source = readSource(MANAGE_WORKERS_PAGE);

  assert.match(source, /fieldErrors/);
  assert.match(source, /CPF precisa ter 11 dígitos/);
  assert.match(source, /PIS\/NIS precisa ter 11 dígitos/);
  assert.match(source, /RG precisa ter 8 ou 9 dígitos/);
  assert.match(source, /setPendingDeleteUser/);
  assert.match(source, /Confirmar remoção/);
  assert.doesNotMatch(source, /\bconfirm\(/);
  assert.doesNotMatch(source, /\balert\(/);
});

test('S5-05 team page includes desktop table and mobile cards without losing status', () => {
  const source = readSource(MANAGE_WORKERS_PAGE);

  assert.match(source, /hidden overflow-x-auto rounded-lg border border-outline md:block/);
  assert.match(source, /grid gap-3 md:hidden/);
  assert.match(source, /min-w-\[56rem\]/);
  assert.match(source, /function statusLabel/);
  assert.match(source, /Desligado/);
  assert.match(source, />Saída</);
  assert.match(source, /renderUserActions\(user, 'mobile'\)/);
});

test('users API preserves worker-only defaults and adds team-management view', () => {
  const source = readSource(USERS_ROUTE);

  assert.match(source, /teamManagementView/);
  assert.match(source, /view'\) === 'team-management'/);
  assert.match(source, /return teamManagementView \|\| userType === 1/);

  const gamificationBranch = source.slice(
    source.indexOf('if (gamificationView)'),
    source.indexOf('const cpf = maskCpf'),
  );

  assert.match(gamificationBranch, /user_type: userType/);
  assert.doesNotMatch(gamificationBranch, /CPF|PIS|RG|email|birthdate|birth_date/);
});

test('user detail API masks documents by default and reveals only with RBAC-backed action', () => {
  const source = readSource(USER_ROUTE);

  assert.match(source, /searchParams\.get\('reveal'\) === 'documents'/);
  assert.match(source, /maskCpf\(cpfValue\)/);
  assert.match(source, /maskPis\(pisValue\)/);
  assert.match(source, /maskRg\(rgValue\)/);
  assert.match(source, /requireScopedPermission\(session, 'users', isSelf \? 'update' : 'manage', revealScope\)/);
  assert.match(source, /documents_revealed/);
});

test('administrative user mutations keep cooperative scope in server-side RBAC', () => {
  for (const routePath of [USERS_CREATE_ROUTE, USER_UPDATE_ROUTE, USERS_DELETE_ROUTE]) {
    const source = readSource(routePath);

    assert.match(source, /requireScopedPermission/);
    assert.match(source, /'users'/);
    assert.match(source, /session\.role === 'admin'/);
  }

  assert.match(readSource(USER_UPDATE_ROUTE), /scopedWorkerWhere\(session, workerId\)/);
  assert.match(readSource(USERS_DELETE_ROUTE), /scopedWorkerWhere\(session, workerId\)/);
});

test('create route preserves CPF as a global login identity with generic conflicts', () => {
  const source = readSource(USERS_CREATE_ROUTE);

  assert.match(source, /normalizeCpfDigits/);
  assert.match(source, /LOCK TABLE "Workers" IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(source, /where:\s*\{\s*cpf: cpfBuffer\s*\}/);
  assert.match(source, /USER_CREATE_CONFLICT/);
  assert.match(source, /Não foi possível concluir o cadastro com os dados informados/);
  assert.doesNotMatch(source, /select:\s*\{\s*workerId:\s*true,\s*cooperative:\s*true\s*\}/);
});

test('document normalization rejects partial values before persistence', () => {
  assert.equal(normalizeCpfDigits('000.000.000-01'), '00000000001');
  assert.equal(normalizeCpfDigits('1'), null);
  assert.equal(normalizePisDigits('90000000001'), '90000000001');
  assert.equal(normalizePisDigits('900'), null);
  assert.equal(normalizeRgDigits('990000001'), '990000001');
  assert.equal(normalizeRgDigits('12345678'), '12345678');
  assert.equal(normalizeRgDigits('2'), null);
});

test('masked document values are not persisted back as partial digits', () => {
  const profileUpdateSource = readSource(PROFILE_UPDATE_ROUTE);
  const adminUpdateSource = readSource(USER_UPDATE_ROUTE);

  assert.match(profileUpdateSource, /isMaskedDocument/);
  assert.match(profileUpdateSource, /normalizePisDigits\(PIS\)/);
  assert.match(profileUpdateSource, /normalizeRgDigits\(RG\)/);
  assert.match(adminUpdateSource, /isMaskedDocument/);
  assert.match(adminUpdateSource, /normalizePisDigits\(PIS\)/);
  assert.match(adminUpdateSource, /normalizeRgDigits\(RG\)/);
});

test('vault documents S5-05 PII reveal policy and team-management API view', () => {
  const source = readSource(USERS_DOCS);

  assert.match(source, /CPF, PIS e RG saem mascarados por padrao/);
  assert.match(source, /reveal=documents/);
  assert.match(source, /view=team-management/);
  assert.match(source, /CPF e identidade global de login/);
});
