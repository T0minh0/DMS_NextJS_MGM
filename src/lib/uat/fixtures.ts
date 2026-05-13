export type UatProductRole = 'admin' | 'manager' | 'operator' | 'viewer';
export type UatSaleState = 'active' | 'completed' | 'cancelled';
export type UatJourneyId =
  | 'daily-dashboard'
  | 'critical-stock'
  | 'normal-sale'
  | 'collective-sale'
  | 'team-pii'
  | 'notices'
  | 'reports-pdf'
  | 'operational-pending';

export interface UatIdentityFixture {
  id: string;
  label: string;
  productRole: UatProductRole | 'worker';
  implementedRole: 'admin' | 'manager' | 'worker';
  cooperativeId: 'horizonte' | 'leste';
  cpf: string;
  pis: string;
  rg: string;
  passwordAlias: string;
  notes?: string;
}

export const UAT_FIXTURE_IDENTITIES: UatIdentityFixture[] = [
  {
    id: 'admin-system',
    label: 'Admin UAT Sistema',
    productRole: 'admin',
    implementedRole: 'admin',
    cooperativeId: 'horizonte',
    cpf: '00000000001',
    pis: '90000000001',
    rg: '990000001',
    passwordAlias: 'uat-admin-123',
  },
  {
    id: 'manager-horizonte',
    label: 'Gerente UAT Horizonte',
    productRole: 'manager',
    implementedRole: 'manager',
    cooperativeId: 'horizonte',
    cpf: '00000000002',
    pis: '90000000002',
    rg: '990000002',
    passwordAlias: 'uat-manager-123',
  },
  {
    id: 'operator-horizonte',
    label: 'Operador UAT Horizonte',
    productRole: 'operator',
    implementedRole: 'manager',
    cooperativeId: 'horizonte',
    cpf: '00000000003',
    pis: '90000000003',
    rg: '990000003',
    passwordAlias: 'uat-operator-123',
    notes: 'Persona de produto; RBAC dedicado ainda nao existe, entao o seed usa role manager.',
  },
  {
    id: 'viewer-horizonte',
    label: 'Visualizador UAT Horizonte',
    productRole: 'viewer',
    implementedRole: 'manager',
    cooperativeId: 'horizonte',
    cpf: '00000000004',
    pis: '90000000004',
    rg: '990000004',
    passwordAlias: 'uat-viewer-123',
    notes: 'Persona de produto; RBAC dedicado ainda nao existe, entao o seed usa role manager.',
  },
  {
    id: 'worker-horizonte-active',
    label: 'Trabalhadora UAT Ativa',
    productRole: 'worker',
    implementedRole: 'worker',
    cooperativeId: 'horizonte',
    cpf: '00000000011',
    pis: '90000000011',
    rg: '990000011',
    passwordAlias: 'uat-worker-123',
  },
  {
    id: 'worker-horizonte-empty',
    label: 'Trabalhador UAT Sem Operacao',
    productRole: 'worker',
    implementedRole: 'worker',
    cooperativeId: 'horizonte',
    cpf: '00000000012',
    pis: '90000000012',
    rg: '990000012',
    passwordAlias: 'uat-worker-123',
  },
  {
    id: 'worker-horizonte-inactive',
    label: 'Trabalhadora UAT Desligada',
    productRole: 'worker',
    implementedRole: 'worker',
    cooperativeId: 'horizonte',
    cpf: '00000000013',
    pis: '90000000013',
    rg: '990000013',
    passwordAlias: 'uat-worker-123',
  },
  {
    id: 'manager-leste',
    label: 'Gerente UAT Leste',
    productRole: 'manager',
    implementedRole: 'manager',
    cooperativeId: 'leste',
    cpf: '00000000022',
    pis: '90000000022',
    rg: '990000022',
    passwordAlias: 'uat-manager-123',
  },
  {
    id: 'worker-leste',
    label: 'Trabalhador UAT Leste',
    productRole: 'worker',
    implementedRole: 'worker',
    cooperativeId: 'leste',
    cpf: '00000000023',
    pis: '90000000023',
    rg: '990000023',
    passwordAlias: 'uat-worker-123',
  },
];

export const UAT_MATERIAL_FIXTURES = [
  {
    id: 'cardboard-stocked',
    label: 'UAT Papelao Ondulado',
    cooperativeId: 'horizonte',
    stockCase: 'sufficient',
    currentStockKg: 230,
  },
  {
    id: 'pet-stocked',
    label: 'UAT Plastico PET Cristal',
    cooperativeId: 'horizonte',
    stockCase: 'sufficient',
    currentStockKg: 175,
  },
  {
    id: 'aluminum-low-stock',
    label: 'UAT Aluminio Prensado',
    cooperativeId: 'horizonte',
    stockCase: 'low',
    currentStockKg: 10,
  },
  {
    id: 'glass-empty-stock',
    label: 'UAT Vidro Misto Sem Estoque',
    cooperativeId: 'horizonte',
    stockCase: 'empty',
    currentStockKg: 0,
  },
  {
    id: 'leste-cardboard-stocked',
    label: 'UAT Papelao Ondulado',
    cooperativeId: 'leste',
    stockCase: 'cross-coop',
    currentStockKg: 80,
  },
] as const;

export const UAT_SALE_LIFECYCLE_FIXTURES: Array<{
  id: string;
  cooperativeId: 'horizonte' | 'leste';
  state: UatSaleState;
  seededInCurrentSchema: boolean;
  notes: string;
}> = [
  {
    id: 'normal-active-horizonte',
    cooperativeId: 'horizonte',
    state: 'active',
    seededInCurrentSchema: true,
    notes: 'Representada no schema atual como venda recente para material com estoque suficiente.',
  },
  {
    id: 'normal-completed-horizonte',
    cooperativeId: 'horizonte',
    state: 'completed',
    seededInCurrentSchema: true,
    notes: 'Representada no schema atual como venda historica concluida.',
  },
  {
    id: 'normal-cancelled-horizonte',
    cooperativeId: 'horizonte',
    state: 'cancelled',
    seededInCurrentSchema: false,
    notes: 'Lacuna conhecida ate S2-01 adicionar lifecycle ativo/historico/complete/cancel.',
  },
  {
    id: 'leste-cardboard-sale',
    cooperativeId: 'leste',
    state: 'completed',
    seededInCurrentSchema: true,
    notes: 'Venda persistida da Cooperativa Leste usada como alvo negativo cross-coop para gerente Horizonte.',
  },
];

export const UAT_COLLECTIVE_SALE_FIXTURES = [
  {
    id: 'collective-open-two-coops',
    state: 'invite-open',
    seededInCurrentSchema: false,
    notes: 'Lacuna ate S1-02/S3-01 criarem tabelas e APIs de vendas coletivas.',
  },
  {
    id: 'collective-contribution-pending',
    state: 'contribution-pending',
    seededInCurrentSchema: false,
    notes: 'Usado como contrato de UAT para convite/contribuicao entre Horizonte e Leste.',
  },
];

export const UAT_NEGATIVE_SCENARIOS = [
  {
    id: 'manager-horizonte-worker-leste-denied',
    actorFixtureId: 'manager-horizonte',
    targetFixtureId: 'worker-leste',
    route: '/api/user?id=<worker-leste>',
    expected: '404_not_found_scoped_or_empty',
  },
  {
    id: 'manager-horizonte-sale-leste-denied',
    actorFixtureId: 'manager-horizonte',
    targetFixtureId: 'leste-cardboard-sale',
    route: '/api/sales/<sale-leste>',
    expected: '404_not_found_scoped_or_empty',
  },
  {
    id: 'worker-web-login-denied',
    actorFixtureId: 'worker-horizonte-active',
    targetFixtureId: 'web-session',
    route: '/api/auth/login',
    expected: '403_WEB_ROLE_DENIED',
  },
];

export const UAT_DECLARED_PSEUDO_FIXTURE_IDS = ['web-session'] as const;

export const UAT_DECLARED_FUTURE_FIXTURE_IDS = [
  'notice-global-safe',
  'notice-coop-horizonte',
  'notice-xss-blocked',
  'job-pending-achievements',
] as const;

export const UAT_JOURNEY_FIXTURE_MATRIX: Array<{
  journeyId: UatJourneyId;
  title: string;
  routeTargets: string[];
  fixtureIds: string[];
  gap?: string;
  negativeScenarioId: string;
}> = [
  {
    journeyId: 'daily-dashboard',
    title: 'Abrir painel do dia',
    routeTargets: ['/login', '/'],
    fixtureIds: [
      'manager-horizonte',
      'cardboard-stocked',
      'aluminum-low-stock',
      'normal-active-horizonte',
    ],
    negativeScenarioId: 'worker-web-login-denied',
  },
  {
    journeyId: 'critical-stock',
    title: 'Revisar estoque critico',
    routeTargets: ['/materials'],
    fixtureIds: ['aluminum-low-stock', 'glass-empty-stock', 'leste-cardboard-stocked'],
    negativeScenarioId: 'manager-horizonte-worker-leste-denied',
  },
  {
    journeyId: 'normal-sale',
    title: 'Criar e acompanhar venda normal',
    routeTargets: ['/sales'],
    fixtureIds: [
      'normal-active-horizonte',
      'normal-completed-horizonte',
      'normal-cancelled-horizonte',
    ],
    gap: 'Estado cancelado depende do lifecycle de S2-01; a matriz declara o caso e o seed atual cobre vendas recentes/historicas.',
    negativeScenarioId: 'manager-horizonte-sale-leste-denied',
  },
  {
    journeyId: 'collective-sale',
    title: 'Criar ou participar de venda coletiva',
    routeTargets: ['/sales', '/collective-sales'],
    fixtureIds: ['collective-open-two-coops', 'collective-contribution-pending'],
    gap: 'Persistencia depende de S1-02/S3-01; fixture fica declarada como contrato de UAT.',
    negativeScenarioId: 'manager-horizonte-sale-leste-denied',
  },
  {
    journeyId: 'team-pii',
    title: 'Gerenciar equipe',
    routeTargets: ['/manage-workers', '/worker-productivity'],
    fixtureIds: [
      'manager-horizonte',
      'worker-horizonte-active',
      'worker-horizonte-empty',
      'worker-horizonte-inactive',
      'worker-leste',
    ],
    negativeScenarioId: 'manager-horizonte-worker-leste-denied',
  },
  {
    journeyId: 'notices',
    title: 'Publicar aviso',
    routeTargets: ['/notices'],
    fixtureIds: ['notice-global-safe', 'notice-coop-horizonte', 'notice-xss-blocked'],
    gap: 'Persistencia depende de S4-01/S4-02; payloads ficam na matriz ate existirem tabelas/API.',
    negativeScenarioId: 'manager-horizonte-worker-leste-denied',
  },
  {
    journeyId: 'reports-pdf',
    title: 'Baixar relatorio/PDF',
    routeTargets: ['/reports'],
    fixtureIds: [
      'normal-completed-horizonte',
      'collective-open-two-coops',
      'normal-cancelled-horizonte',
    ],
    gap: 'PDFs reais dependem de S3-04/S3-05; esta matriz define dados de entrada e negativos.',
    negativeScenarioId: 'manager-horizonte-sale-leste-denied',
  },
  {
    journeyId: 'operational-pending',
    title: 'Investigar pendencia operacional',
    routeTargets: ['/', '/materials', '/worker-productivity'],
    fixtureIds: ['glass-empty-stock', 'worker-horizonte-empty', 'job-pending-achievements'],
    gap: 'Fila de pendencias e jobs persistidos dependem de S4/S5; casos ficam declarados para UAT.',
    negativeScenarioId: 'worker-web-login-denied',
  },
];
