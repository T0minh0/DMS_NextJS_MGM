import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.DMS_UAT_BASE_URL || 'http://localhost:3106';
const OUTPUT_DIR = path.resolve('output/playwright/s5-02');
const JWT_SECRET = process.env.JWT_SECRET || 'dms-dashboard-local-development-secret';
const require = createRequire(import.meta.url);
const BACKEND_CONTRACT_TESTS = [
  'tests/auth-rbac.test.ts',
  'tests/reports-sales-s304-api.test.ts',
  'tests/reports-sales-s305-api.test.ts',
];

const managerSession = {
  id: '2',
  worker_id: 2,
  full_name: 'Gerente UAT Horizonte',
  name: 'Gerente UAT Horizonte',
  role: 'manager',
  userType: 0,
  user_type: 0,
  cooperative_id: '1',
  cooperative_name: 'Cooperativa UAT Horizonte',
};

const adminSession = {
  id: '1',
  worker_id: 1,
  full_name: 'Admin UAT Sistema',
  name: 'Admin UAT Sistema',
  role: 'admin',
  userType: 0,
  user_type: 0,
  cooperative_id: '1',
  cooperative_name: 'Cooperativa UAT Horizonte',
};

const workerSession = {
  id: '11',
  worker_id: 11,
  full_name: 'Trabalhadora UAT Ativa',
  name: 'Trabalhadora UAT Ativa',
  role: 'worker',
  userType: 1,
  user_type: 1,
  cooperative_id: '1',
  cooperative_name: 'Cooperativa UAT Horizonte',
};

const materials = [
  { _id: 'group-Papeis UAT', group: 'Papeis UAT', isGroup: true },
  { _id: '1', material_id: '1', material: 'UAT Papelao Ondulado', name: 'UAT Papelao Ondulado', group: 'Papeis UAT' },
  { _id: '2', material_id: '2', material: 'UAT Plastico PET Cristal', name: 'UAT Plastico PET Cristal', group: 'Plasticos UAT' },
  { _id: '3', material_id: '3', material: 'UAT Aluminio Prensado', name: 'UAT Aluminio Prensado', group: 'Metais UAT' },
  { _id: '4', material_id: '4', material: 'UAT Vidro Misto Sem Estoque', name: 'UAT Vidro Misto Sem Estoque', group: 'Vidros UAT' },
];

const stockRows = [
  { material_id: '1', name: 'UAT Papelao Ondulado', group: 'Papeis UAT', cooperative_id: '1', stock_kg: 230, total_collected_kg: 300, total_sold_kg: 70 },
  { material_id: '2', name: 'UAT Plastico PET Cristal', group: 'Plasticos UAT', cooperative_id: '1', stock_kg: 175, total_collected_kg: 210, total_sold_kg: 35 },
  { material_id: '3', name: 'UAT Aluminio Prensado', group: 'Metais UAT', cooperative_id: '1', stock_kg: 10, total_collected_kg: 60, total_sold_kg: 50 },
  { material_id: '4', name: 'UAT Vidro Misto Sem Estoque', group: 'Vidros UAT', cooperative_id: '1', stock_kg: 0, total_collected_kg: 15, total_sold_kg: 15 },
];

const buyers = [
  { _id: '1', name: 'UAT Recicla Cidades' },
  { _id: '2', name: 'UAT Eco Verde Comercial' },
  { _id: '3', name: 'UAT Comprador Venda Coletiva' },
];

const users = [
  {
    _id: '11',
    id: '11',
    worker_id: '11',
    wastepicker_id: '11',
    full_name: 'Trabalhadora UAT Ativa',
    worker_name: 'Trabalhadora UAT Ativa',
    email: 'ativa.uat@example.test',
    user_type: 1,
    userType: 1,
    cooperative_id: '1',
    cooperative_name: 'Cooperativa UAT Horizonte',
    documents: [{ document_type: 'CPF', value: '********011' }],
    cpf: '********011',
    enter_date: '2024-01-10T00:00:00.000Z',
    exit_date: null,
  },
  {
    _id: '12',
    id: '12',
    worker_id: '12',
    wastepicker_id: '12',
    full_name: 'Trabalhador UAT Sem Operacao',
    worker_name: 'Trabalhador UAT Sem Operacao',
    email: 'sem-operacao.uat@example.test',
    user_type: 1,
    userType: 1,
    cooperative_id: '1',
    cooperative_name: 'Cooperativa UAT Horizonte',
    documents: [{ document_type: 'CPF', value: '********012' }],
    cpf: '********012',
    enter_date: '2024-02-01T00:00:00.000Z',
    exit_date: null,
  },
  {
    _id: '13',
    id: '13',
    worker_id: '13',
    wastepicker_id: '13',
    full_name: 'Trabalhadora UAT Desligada',
    worker_name: 'Trabalhadora UAT Desligada',
    email: 'desligada.uat@example.test',
    user_type: 1,
    userType: 1,
    cooperative_id: '1',
    cooperative_name: 'Cooperativa UAT Horizonte',
    documents: [{ document_type: 'CPF', value: '********013' }],
    cpf: '********013',
    enter_date: '2023-08-01T00:00:00.000Z',
    exit_date: '2025-02-01T00:00:00.000Z',
  },
];

const sales = [
  {
    _id: '101',
    material_id: '1',
    cooperative_id: '1',
    status: 'ACTIVE',
    'price/kg': 1.35,
    weight_sold: 24,
    date: '2026-05-12T00:00:00.000Z',
    created_at: '2026-05-12T00:00:00.000Z',
    sold_at: null,
    cancelled_at: null,
    expected_sale_date: '2026-05-20T00:00:00.000Z',
    Buyer: 'UAT Recicla Cidades',
  },
  {
    _id: '102',
    material_id: '3',
    cooperative_id: '1',
    status: 'SOLD',
    'price/kg': 5.1,
    weight_sold: 9,
    date: '2026-05-08T00:00:00.000Z',
    created_at: '2026-05-08T00:00:00.000Z',
    sold_at: '2026-05-09T00:00:00.000Z',
    cancelled_at: null,
    expected_sale_date: '2026-05-08T00:00:00.000Z',
    Buyer: 'UAT Eco Verde Comercial',
  },
];

const collectiveSales = [
  {
    _id: '201',
    material_id: '1',
    material_name: 'UAT Papelao Ondulado',
    creator_cooperative_id: '1',
    creator_cooperative_name: 'Cooperativa UAT Horizonte',
    buyer_name: 'UAT Comprador Venda Coletiva',
    'price/kg': 1.55,
    price_per_kg: 1.55,
    total_weight: 42,
    expected_sale_date: '2026-05-24T00:00:00.000Z',
    created_at: '2026-05-12T00:00:00.000Z',
    sold_at: null,
    cancelled_at: null,
    status: 'ACTIVE',
    my_participation: 'ACCEPTED',
    participants: [
      { contribution_id: '501', cooperative_id: '1', cooperative_name: 'Cooperativa UAT Horizonte', status: 'ACCEPTED', contributed_weight: 42 },
    ],
    contributions: [
      { cooperative_id: '1', cooperative_name: 'Cooperativa UAT Horizonte', status: 'ACCEPTED', contributed_weight: 42, revenue_share: 65.1 },
    ],
  },
];

const notices = [
  {
    _id: '301',
    title: 'UAT Aviso global seguro',
    content: '<p>Coleta especial confirmada.</p>',
    priority: 2,
    is_global: true,
    cooperative_id: null,
    expires_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    _id: '302',
    title: 'UAT Horizonte - coleta antecipada',
    content: '<p>Equipe deve revisar estoque critico.</p>',
    priority: 3,
    is_global: false,
    cooperative_id: '1',
    expires_at: '2026-06-01T00:00:00.000Z',
    created_at: '2026-05-02T00:00:00.000Z',
  },
];

const S5_02_ROUTES = [
  { id: 'login', path: '/login', title: 'Login', expectedText: 'Sistema de Gestão DMS', interaction: 'login-success' },
  { id: 'dashboard', path: '/', title: 'Dashboard', expectedText: 'Painel do dia da cooperativa', interaction: 'dashboard-filter' },
  { id: 'sales', path: '/sales', title: 'Vendas', expectedText: 'Gestão de Vendas', interaction: 'open-sale-modal' },
  { id: 'materials', path: '/materials', title: 'Materiais', expectedText: 'Operação de materiais', interaction: 'stock-review' },
  { id: 'manage-workers', path: '/manage-workers', title: 'Equipe', expectedText: 'Equipe gerenciada', interaction: 'team-search' },
  { id: 'worker-productivity', path: '/worker-productivity', title: 'Produtividade', expectedText: 'Produtividade dos Trabalhadores', interaction: 'select-worker' },
  { id: 'profile', path: '/profile', title: 'Perfil', expectedText: 'Perfil do Usuário', interaction: 'profile-read' },
  { id: 'notices', path: '/notices', title: 'Avisos', expectedText: 'Mural de Avisos', interaction: 'priority-filter' },
  { id: 'collective-sales', path: '/collective-sales', title: 'Coletivas', expectedText: 'Vendas Coletivas', interaction: 'collective-tab' },
];

function signSession(session) {
  return jwt.sign(
    {
      sub: String(session.worker_id),
      workerId: String(session.worker_id),
      cooperativeId: String(session.cooperative_id),
      role: session.role,
      userType: session.userType,
      name: session.full_name,
      cooperativeName: session.cooperative_name,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      audience: 'dms-dashboard',
      issuer: 'dms-nextjs-mgm',
      expiresIn: '8h',
    },
  );
}

function jsonResponse(route, body, status = 200, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

function methodIs(method, allowedMethods) {
  return allowedMethods.includes(method);
}

function unhandledMockResponse(route, method, pathname) {
  return jsonResponse(route, {
    message: `Unhandled mocked API request: ${method} ${pathname}`,
    code: 'UNHANDLED_MOCKED_API_REQUEST',
  }, 599);
}

function salesForStatus(status) {
  if (status === 'HISTORY') return sales.filter((sale) => sale.status === 'SOLD');
  if (status === 'CANCELLED') return sales.filter((sale) => sale.status === 'CANCELLED');
  return sales.filter((sale) => sale.status === 'ACTIVE');
}

async function mockApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  const method = request.method();
  const reject = () => unhandledMockResponse(route, method, pathname);

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    if (body.cpf === '00000000011') {
      return jsonResponse(route, { message: 'Acesso restrito. Apenas gerentes podem acessar o sistema.' }, 403);
    }

    const token = signSession(body.cpf === '00000000001' ? adminSession : managerSession);
    return jsonResponse(route, { user: managerSession }, 200, {
      'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
    });
  }
  if (pathname === '/api/auth/login') return reject();

  if (pathname === '/api/auth/logout') return methodIs(method, ['POST']) ? jsonResponse(route, { success: true }) : reject();
  if (pathname === '/api/auth/session') return methodIs(method, ['GET']) ? jsonResponse(route, managerSession) : reject();
  if (pathname === '/api/materials') return methodIs(method, ['GET']) ? jsonResponse(route, materials) : reject();
  if (pathname === '/api/cooperative/materials') {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, {
      materials: stockRows,
      count: stockRows.length,
      total: stockRows.length,
      limit: 500,
      has_more: false,
      truncated: false,
    });
  }
  if (pathname === '/api/stock' && method === 'GET') {
    return jsonResponse(route, {
      'UAT Papelao Ondulado': 230,
      'UAT Plastico PET Cristal': 175,
      'UAT Aluminio Prensado': 10,
      'UAT Vidro Misto Sem Estoque': 0,
    });
  }
  if (pathname === '/api/stock' && method === 'POST') {
    return jsonResponse(route, { success: true, stock: { current_stock_kg: 235 } });
  }
  if (pathname === '/api/stock') return reject();
  if (pathname === '/api/users') return methodIs(method, ['GET']) ? jsonResponse(route, users) : reject();
  if (pathname === '/api/users/all') return methodIs(method, ['GET']) ? jsonResponse(route, users) : reject();
  if (pathname === '/api/user') {
    if (!methodIs(method, ['GET'])) return reject();
    const id = url.searchParams.get('id');
    if (id === '23' || id === '999') {
      return jsonResponse(route, { message: 'Usuário não encontrado' }, 404);
    }
    return jsonResponse(route, {
      ...managerSession,
      id: id || '2',
      user_id: id || '2',
      full_name: id === '11' ? 'Trabalhadora UAT Ativa' : managerSession.full_name,
      email: 'gerente.uat@example.test',
      documents: [{ document_type: 'CPF', value: '********002' }],
      cpf: '********002',
    });
  }
  if (pathname === '/api/cooperatives') {
    return methodIs(method, ['GET']) ? jsonResponse(route, [{ _id: '1', cooperative_id: '1', name: 'Cooperativa UAT Horizonte' }]) : reject();
  }
  if (pathname === '/api/worker-productivity') {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, {
      weeklyContributions: [
        {
          week: '2026-W20',
          weekStart: '2026-05-11',
          weekEnd: '2026-05-17',
          totalWeight: 42,
          materials: {
            1: { materialName: 'UAT Papelao Ondulado', weight: 42, measurements: [] },
          },
        },
      ],
      stats: {
        totalWeeks: 1,
        totalWeight: 42,
        averageWeekly: 42,
        bestWeek: { week: '2026-W20', weight: 42 },
        topMaterials: [{ materialName: 'UAT Papelao Ondulado', totalWeight: 42 }],
      },
    });
  }
  if (pathname === '/api/sales') {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, { sales: salesForStatus(url.searchParams.get('status') || 'ACTIVE') });
  }
  if (pathname.startsWith('/api/sales/') && pathname.includes('/complete')) {
    return methodIs(method, ['POST']) ? jsonResponse(route, { sale: { ...sales[0], status: 'SOLD' } }) : reject();
  }
  if (pathname.startsWith('/api/sales/') && pathname.includes('/cancel')) {
    return methodIs(method, ['POST']) ? jsonResponse(route, { sale: { ...sales[0], status: 'CANCELLED' } }) : reject();
  }
  if (pathname.startsWith('/api/sales/')) {
    return methodIs(method, ['GET', 'PATCH', 'DELETE']) ? jsonResponse(route, { sale: sales[0] }) : reject();
  }
  if (pathname === '/api/buyers' || pathname === '/api/sales/buyers') {
    return methodIs(method, ['GET']) ? jsonResponse(route, { buyers }) : reject();
  }
  if (pathname === '/api/collective-sales') {
    return methodIs(method, ['GET']) ? jsonResponse(route, { collective_sales: collectiveSales }) : reject();
  }
  if (pathname === '/api/collective-sales/invitations') {
    return methodIs(method, ['GET']) ? jsonResponse(route, { invitations: [] }) : reject();
  }
  if (pathname.match(/^\/api\/collective-sales\/[^/]+\/invite$/)) {
    return methodIs(method, ['POST']) ? jsonResponse(route, { success: true, sale: collectiveSales[0] }) : reject();
  }
  if (pathname.match(/^\/api\/collective-sales\/[^/]+\/contribution$/)) {
    return methodIs(method, ['PATCH']) ? jsonResponse(route, { success: true, sale: collectiveSales[0] }) : reject();
  }
  if (pathname.match(/^\/api\/collective-sales\/[^/]+\/(?:join|leave|cancel|complete)$/)) {
    return methodIs(method, ['POST']) ? jsonResponse(route, { success: true, sale: collectiveSales[0] }) : reject();
  }
  if (pathname.match(/^\/api\/collective-sales\/[^/]+$/)) {
    return methodIs(method, ['GET', 'PATCH']) ? jsonResponse(route, { success: true, sale: collectiveSales[0] }) : reject();
  }
  if (pathname === '/api/notices') return methodIs(method, ['GET', 'POST']) ? jsonResponse(route, { notices }) : reject();
  if (pathname === '/api/notices/global') return methodIs(method, ['GET']) ? jsonResponse(route, { notices }) : reject();
  if (pathname === '/api/notices/filter') {
    return methodIs(method, ['GET'])
      ? jsonResponse(route, { notices: notices.filter((notice) => notice.priority === Number(url.searchParams.get('priority'))) })
      : reject();
  }
  if (pathname.startsWith('/api/notices/')) {
    return methodIs(method, ['GET', 'PATCH', 'DELETE']) ? jsonResponse(route, { notice: notices[0] }) : reject();
  }
  if (pathname === '/api/birthdays') return methodIs(method, ['GET']) ? jsonResponse(route, [{ name: 'Trabalhadora UAT Ativa', date: '2026-05-18' }]) : reject();
  if (pathname === '/api/earnings-comparison') return methodIs(method, ['GET']) ? jsonResponse(route, [{ period: '2026-05', earnings: 1820 }]) : reject();
  if (pathname === '/api/price-fluctuation') {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, { materials: ['UAT Papelao Ondulado'], priceData: [{ period: '2026-05', 'UAT Papelao Ondulado': 1.35 }] });
  }
  if (pathname === '/api/worker-collections') {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, { grouped: true, data: [{ worker_name: 'Trabalhadora UAT Ativa', totalWeight: 42 }] });
  }
  if (pathname.startsWith('/api/reports/sales/')) {
    if (!methodIs(method, ['GET'])) return reject();
    return jsonResponse(route, { report: { _id: '101', material_name: 'UAT Papelao Ondulado', total_revenue: 32.4 } });
  }
  if (pathname.startsWith('/api/reports/pdf/')) {
    if (!methodIs(method, ['GET'])) return reject();
    return route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4\n% S5-02 synthetic report\n%%EOF\n'),
    });
  }

  return reject();
}

async function importPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    throw new Error(
      `Playwright is required for S5-02 UAT. Install it or expose it via NODE_PATH. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function prepareContext(browser, session = managerSession, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  await context.addCookies([{
    name: 'auth_token',
    value: signSession(session),
    url: BASE_URL,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  return context;
}

async function setupPage(context, consoleEntries, networkFailures, httpFailures = []) {
  const page = await context.newPage();
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('requestfailed', (request) => {
    networkFailures.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpFailures.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });
  await page.route('**/api/**', mockApi);
  return page;
}

async function runInteraction(page, interaction) {
  if (interaction === 'login-success') {
    await page.getByLabel('CPF').fill('00000000002');
    await page.getByLabel('Senha').fill('uat-manager-123');
    await page.getByRole('button', { name: /Entrar/i }).click();
    await page.waitForURL('**/', { timeout: 10000 });
    return 'login submitted and redirected to dashboard';
  }
  if (interaction === 'dashboard-filter') {
    await page.getByLabel('Material').selectOption('1');
    await page.waitForFunction(() => document.querySelector('#materialFilter')?.value === '1');
    await page.getByText('Estoque total').first().waitFor({ timeout: 10000 });
    return 'dashboard material filter selected and operational cards loaded';
  }
  if (interaction === 'open-sale-modal') {
    await page.getByRole('button', { name: /Nova Venda/i }).click();
    await page.getByText('Nova Venda').last().waitFor({ timeout: 10000 });
    return 'sale creation modal opened';
  }
  if (interaction === 'stock-review') {
    await page.getByRole('button', { name: /^Ajustar$/ }).first().click();
    await page.getByLabel('Peso a adicionar (kg) *').fill('1,25');
    await page.getByRole('button', { name: 'Revisar impacto' }).click();
    await page.getByText('Confirmar este ajuste').waitFor({ timeout: 10000 });
    return 'stock adjustment impact reviewed';
  }
  if (interaction === 'team-search') {
    await page.getByPlaceholder('Buscar nome ou documento').fill('Ativa');
    await page.getByText('Trabalhadora UAT Ativa').first().waitFor({ timeout: 10000 });
    return 'team search filtered one worker';
  }
  if (interaction === 'select-worker') {
    await page.getByLabel('Selecionar Trabalhador').selectOption('11');
    await page.getByText('42.00').first().waitFor({ timeout: 10000 });
    return 'worker productivity selected fixture worker';
  }
  if (interaction === 'profile-read') {
    await page.getByText('Gerente UAT Horizonte').first().waitFor({ timeout: 10000 });
    return 'profile data loaded from scoped user endpoint';
  }
  if (interaction === 'priority-filter') {
    await page.getByRole('button', { name: 'P3' }).click();
    await page.getByText('UAT Horizonte - coleta antecipada').waitFor({ timeout: 10000 });
    return 'notice priority filter applied';
  }
  if (interaction === 'collective-tab') {
    await page.getByText('UAT Papelao Ondulado').first().waitFor({ timeout: 10000 });
    return 'collective sales list loaded with report links';
  }
  return 'no interaction configured';
}

async function captureRoute(browser, route, viewportName, viewport) {
  const consoleEntries = [];
  const networkFailures = [];
  const httpFailures = [];
  const context = route.id === 'login'
    ? await browser.newContext({ baseURL: BASE_URL, viewport })
    : await prepareContext(browser, managerSession, viewport);
  const page = await setupPage(context, consoleEntries, networkFailures, httpFailures);
  const screenshotPath = path.join(OUTPUT_DIR, `${route.id}-${viewportName}.png`);

  if (route.id !== 'login') {
    await page.addInitScript((session) => {
      window.localStorage.setItem('user', JSON.stringify(session));
    }, managerSession);
  }

  await page.goto(route.path, { waitUntil: 'networkidle' });
  await page.getByText(route.expectedText).first().waitFor({ timeout: 10000 });
  const interactionResult = viewportName === 'desktop'
    ? await runInteraction(page, route.interaction)
    : 'mobile screenshot and DOM validation';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate(() => ({
    title: document.title,
    bodyTextLength: document.body.innerText.trim().length,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    currentUrl: window.location.href,
  }));

  await context.close();

  return {
    route: route.path,
    title: route.title,
    viewport: viewportName,
    expectedText: route.expectedText,
    interaction: interactionResult,
    screenshot: screenshotPath,
    consoleEntries,
    networkFailures,
    httpFailures,
    ...metrics,
  };
}

async function runNegativeChecks(browser) {
  const noSessionContext = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 800 } });
  const noSessionPage = await noSessionContext.newPage();
  await noSessionPage.goto('/materials', { waitUntil: 'networkidle' });
  const noSessionUrl = noSessionPage.url();
  await noSessionContext.close();

  const workerContext = await prepareContext(browser, workerSession, { width: 1280, height: 800 });
  const workerPage = await workerContext.newPage();
  await workerPage.goto('/materials', { waitUntil: 'networkidle' });
  const workerUrl = workerPage.url();
  await workerContext.close();

  return {
    noSessionRedirected: noSessionUrl.endsWith('/login'),
    noSessionUrl,
    workerDenied: workerUrl.includes('/login?reason=web-role-denied'),
    workerUrl,
    realProxyChecks: true,
  };
}

async function runReportChecks(browser) {
  const context = await prepareContext(browser, managerSession, { width: 1280, height: 800 });
  const consoleEntries = [];
  const networkFailures = [];
  const page = await setupPage(context, consoleEntries, networkFailures);
  await page.goto('/collective-sales', { waitUntil: 'networkidle' });
  const jsonStatus = await page.evaluate(async () => {
    const response = await fetch('/api/reports/sales/collective/201');
    return response.status;
  });
  const pdfStatus = await page.evaluate(async () => {
    const response = await fetch('/api/reports/pdf/collective-sale/201');
    const bytes = await response.arrayBuffer();
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      magicBytes: new TextDecoder().decode(bytes.slice(0, 4)),
    };
  });
  await context.close();
  return { jsonStatus, pdfStatus, consoleEntries, networkFailures };
}

function tailOutput(value, maxLength = 4000) {
  if (!value) return '';
  return value.length > maxLength ? value.slice(-maxLength) : value;
}

function runBackendContractChecks() {
  const tsxCommand = process.platform === 'win32'
    ? path.resolve('node_modules/.bin/tsx.cmd')
    : path.resolve('node_modules/.bin/tsx');
  const result = spawnSync(tsxCommand, ['--test', ...BACKEND_CONTRACT_TESTS], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || 'local-quality-jwt-secret-with-at-least-32-characters',
    },
  });

  return {
    command: `${path.relative(process.cwd(), tsxCommand)} --test ${BACKEND_CONTRACT_TESTS.join(' ')}`,
    tests: BACKEND_CONTRACT_TESTS,
    status: result.status ?? 1,
    pass: result.status === 0,
    stdoutTail: tailOutput(result.stdout),
    stderrTail: tailOutput(result.stderr),
  };
}

function validateEvidence(evidence) {
  const failures = [];
  const routes = Array.isArray(evidence.routes) ? evidence.routes : [];
  const routeFailures = Array.isArray(evidence.summary?.routeFailures)
    ? evidence.summary.routeFailures
    : [];
  const pdfStatus = evidence.reportChecks?.pdfStatus ?? {};
  const pdfContentType = String(pdfStatus.contentType ?? '');
  const pdfMagicBytes = String(pdfStatus.magicBytes ?? '');

  if (routes.length !== S5_02_ROUTES.length * 2) {
    failures.push(`Expected ${S5_02_ROUTES.length * 2} route checks, got ${routes.length}.`);
  }
  if (routeFailures.length > 0) {
    failures.push(`Route failures were recorded: ${routeFailures.length}.`);
  }
  if (!evidence.negativeChecks?.noSessionRedirected) {
    failures.push('No-session redirect to /login failed.');
  }
  if (!evidence.negativeChecks?.workerDenied) {
    failures.push('Worker web access denial failed.');
  }
  if (evidence.reportChecks?.jsonStatus !== 200) {
    failures.push(`JSON report status expected 200, got ${evidence.reportChecks?.jsonStatus}.`);
  }
  if (pdfStatus.status !== 200) {
    failures.push(`PDF report status expected 200, got ${pdfStatus.status}.`);
  }
  if (!/^application\/pdf\b/i.test(pdfContentType)) {
    failures.push(`PDF report content-type expected application/pdf, got ${pdfContentType || 'empty'}.`);
  }
  if (pdfMagicBytes !== '%PDF') {
    failures.push(`PDF report magic bytes expected %PDF, got ${pdfMagicBytes || 'empty'}.`);
  }
  if (!evidence.backendContractChecks?.pass) {
    failures.push('Backend RBAC/scoping/report contract tests failed.');
  }

  return failures;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const { chromium } = await importPlaywright();
  const browser = await chromium.launch({ headless: true });

  const routeResults = [];
  for (const route of S5_02_ROUTES) {
    routeResults.push(await captureRoute(browser, route, 'desktop', { width: 1366, height: 900 }));
    routeResults.push(await captureRoute(browser, route, 'mobile', { width: 390, height: 844 }));
  }

  const negativeChecks = await runNegativeChecks(browser);
  const reportChecks = await runReportChecks(browser);
  await browser.close();
  const backendContractChecks = runBackendContractChecks();

  const unexpectedConsoleEntries = routeResults.flatMap((result) => result.consoleEntries.map((entry) => ({ route: result.route, viewport: result.viewport, ...entry })));
  const networkFailures = routeResults.flatMap((result) => result.networkFailures.map((entry) => ({ route: result.route, viewport: result.viewport, ...entry })));
  const httpFailures = routeResults.flatMap((result) => result.httpFailures.map((entry) => ({ route: result.route, viewport: result.viewport, ...entry })));
  const routeFailures = routeResults.filter((result) => (
    result.bodyTextLength <= 0 ||
    result.horizontalOverflow ||
    result.consoleEntries.length > 0 ||
    result.networkFailures.length > 0 ||
    result.httpFailures.length > 0
  ));

  const evidence = {
    task: '86e136ckr',
    name: '[S5-02] QA integrado, UAT Browser e regressao visual por jornadas gerenciais',
    browserBackend: 'playwright',
    mockedBackend: true,
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    routes: routeResults,
    negativeChecks,
    reportChecks,
    backendContractChecks,
    summary: {
      routeChecks: routeResults.length,
      desktopScreenshots: routeResults.filter((result) => result.viewport === 'desktop').length,
      mobileScreenshots: routeResults.filter((result) => result.viewport === 'mobile').length,
      unexpectedConsoleEntries,
      networkFailures,
      httpFailures,
      routeFailures,
    },
  };
  const validationFailures = validateEvidence(evidence);
  evidence.summary.validationFailures = validationFailures;
  evidence.summary.pass = validationFailures.length === 0;

  const evidencePath = path.join(OUTPUT_DIR, 's5-02-uat-evidence.json');
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  if (!evidence.summary.pass) {
    console.error(JSON.stringify({
      ...evidence.summary,
      backendContractChecks,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    evidencePath,
    routeChecks: evidence.summary.routeChecks,
    desktopScreenshots: evidence.summary.desktopScreenshots,
    mobileScreenshots: evidence.summary.mobileScreenshots,
    pass: evidence.summary.pass,
  }, null, 2));
}

export { mockApi, validateEvidence };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
