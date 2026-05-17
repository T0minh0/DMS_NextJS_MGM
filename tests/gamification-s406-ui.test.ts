import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  GAMIFICATION_MANAGER_VIEW,
  isGamificationManagerView,
  isGamificationUiEnabled,
} from '../src/lib/features/gamification';

function readSource(filePath: string) {
  return readFileSync(path.resolve(filePath), 'utf8');
}

const PAGE = 'src/app/gamification/page.tsx';
const LAYOUT = 'src/components/Layout.tsx';
const USERS_ROUTE = 'src/app/api/users/route.ts';
const LEADERBOARD_ROUTE = 'src/app/api/leaderboard/route.ts';
const LEADERBOARD_HISTORY_ROUTE = 'src/app/api/leaderboard/history/route.ts';
const ACHIEVEMENTS_ROUTE = 'src/app/api/achievements/route.ts';
const LEVELS_ROUTE = 'src/app/api/levels/route.ts';

test('Layout includes /gamification nav link', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /\/gamification/);
  assert.match(source, /Gamifica/);
});

test('Layout gates /gamification nav by public feature flag and manager roles', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /isGamificationUiEnabled/);
  assert.match(source, /NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI/);
  assert.match(source, /roles: MANAGER_NAV_ROLES/);
  assert.match(source, /item\.roles\.includes\(userRole\)/);
});

test('Layout imports FaTrophy for gamification nav icon', () => {
  const source = readSource(LAYOUT);
  assert.match(source, /FaTrophy/);
});

test('page exports default GamificationPage function', () => {
  const source = readSource(PAGE);
  assert.match(source, /export default function GamificationPage/);
});

test('page uses Layout with activePath /gamification', () => {
  const source = readSource(PAGE);
  assert.match(source, /activePath="\/gamification"/);
});

test('page fetches all summary APIs for leaderboard, history, achievements, levels and users', () => {
  const source = readSource(PAGE);
  assert.match(source, /GAMIFICATION_MANAGER_VIEW/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/leaderboard'\)/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/leaderboard\/history', \{ yearMonth, weekNumber \}\)/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/achievements'\)/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/levels'\)/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/users'\)/);
});

test('page fetches worker level and monthly achievement drill-down APIs', () => {
  const source = readSource(PAGE);
  assert.match(source, /\/api\/levels\/worker\/\$\{selectedWorkerId\}/);
  assert.match(source, /\/api\/achievements\/workers\/\$\{selectedWorkerId\}\/month\?yearMonth=\$\{yearMonth\}/);
});

test('page has yearMonth, weekNumber and current or history controls', () => {
  const source = readSource(PAGE);
  assert.match(source, /yearMonth/);
  assert.match(source, /weekNumber/);
  assert.match(source, /Mês \(AAAA-MM\)/);
  assert.match(source, /type="text"/);
  assert.match(source, /Semana/);
  assert.match(source, /Snapshot atual/);
  assert.match(source, /Histórico/);
});

test('page handles explicit snapshotFound false empty state with jobs or snapshots copy', () => {
  const source = readSource(PAGE);
  assert.match(source, /snapshotFound === false/);
  assert.match(source, /jobs de snapshot|jobs pendentes|snapshot/i);
  assert.match(source, /ausência de snapshot|Nenhum snapshot/i);
  assert.doesNotMatch(source, /`snapshotFound: false`/);
});

test('page includes worker drill-down selector and scoped copy', () => {
  const source = readSource(PAGE);
  assert.match(source, /Drill-down por trabalhador/);
  assert.match(source, /buildGamificationManagerUrl\('\/api\/users'\)/);
  assert.match(source, /escopad[ao]s? no servidor|escopo autorizado|cooperativa/);
});

test('page uses managerial language and avoids player or participant framing', () => {
  const source = readSource(PAGE);
  assert.match(source, /equipe|desempenho|cooperativa|snapshots|jobs/i);
  assert.doesNotMatch(source, /player|participant|jogador/i);
});

test('page keeps labels compact without arbitrary letter spacing and exposes mobile-safe leaderboard overflow', () => {
  const source = readSource(PAGE);
  assert.doesNotMatch(source, /tracking-\[/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-\[44rem\]/);
  assert.match(source, /md:hidden/);
  assert.match(source, /XP final/);
});

test('page avoids treating static achievement definitions as primary team analytics', () => {
  const source = readSource(PAGE);
  assert.match(source, /Achievements do recorte/);
  assert.match(source, /achievements\.length/);
  assert.match(source, /Catálogo de achievements/);
  assert.doesNotMatch(source, /Achievements mapeados/);
  assert.doesNotMatch(source, /Achievements liberados/);
});

test('page gates direct route access and prevents stale async responses', () => {
  const source = readSource(PAGE);
  assert.match(source, /canReadGamificationDashboard/);
  assert.match(source, /viewerRole !== 'worker'/);
  assert.match(source, /Gamificação indisponível/);
  assert.match(source, /summaryRequestRef/);
  assert.match(source, /workerRequestRef/);
  assert.match(source, /summaryRequestRef\.current !== requestId/);
  assert.match(source, /workerRequestRef\.current !== requestId/);
});

test('page clears worker drill-down state when summary scope or availability fails', () => {
  const source = readSource(PAGE);
  assert.match(source, /setSelectedWorkerId\(''\)/);
  assert.match(source, /setWorkerLevel\(null\)/);
  assert.match(source, /setWorkerMonth\(null\)/);
  assert.match(source, /setWorkerError\(null\)/);
  assert.doesNotMatch(source, /Erro ao carregar \$\{url\}/);
});

test('users API exposes a slim gamification selector payload without document fields', () => {
  const source = readSource(USERS_ROUTE);
  assert.match(source, /view'\) === 'gamification'/);
  assert.match(source, /if \(gamificationView\)/);
  const slimBranch = source.slice(
    source.indexOf('if (gamificationView)'),
    source.indexOf('const cpf = maskCpf'),
  );
  assert.match(slimBranch, /full_name/);
  assert.doesNotMatch(slimBranch, /CPF|PIS|RG|email|birthdate|birth_date/);
});

test('manager dashboard API view is denied to worker-scoped gamification reads', () => {
  assert.equal(GAMIFICATION_MANAGER_VIEW, 'gamification');
  assert.equal(isGamificationManagerView(new URLSearchParams('view=gamification')), true);
  assert.equal(isGamificationManagerView(new URLSearchParams('view=worker')), false);

  for (const routePath of [
    LEADERBOARD_ROUTE,
    LEADERBOARD_HISTORY_ROUTE,
    ACHIEVEMENTS_ROUTE,
    LEVELS_ROUTE,
  ]) {
    const source = readSource(routePath);
    assert.match(source, /isGamificationManagerView/);
    assert.match(source, /managerView/);
    assert.match(source, /managerView\s*\?\s*'cooperative'/);
    assert.match(source, /session\.role === 'worker'\s*\?\s*'self'/);
  }
});

test('page contains loading, error, retry, disabled and unavailable states', () => {
  const source = readSource(PAGE);
  assert.match(source, /Carregando leaderboard|Carregando nível|Carregando nivel|Carregando/);
  assert.match(source, /Falha ao carregar|Erro no drill-down|erro/i);
  assert.match(source, /Tentar novamente|Recarregar detalhe|Atualizar leitura/);
  assert.match(source, /disabled:/);
  assert.match(source, /Funcionalidade indisponível|indisponível|indisponivel/i);
});

test('gamification UI flag defaults on but can be disabled by public env', () => {
  assert.equal(isGamificationUiEnabled({}), true);
  assert.equal(isGamificationUiEnabled({ NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI: 'off' }), false);
  assert.equal(isGamificationUiEnabled({ NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION: '0' }), false);
  assert.equal(isGamificationUiEnabled({ NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI: 'on' }), true);
});
