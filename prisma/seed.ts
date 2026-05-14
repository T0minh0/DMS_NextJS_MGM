import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { assertSafeSeedTarget } from '../src/lib/uat/seed-safety';
import { sanitizeNoticeContent, sanitizeNoticeTitle } from '../src/lib/notices/sanitize';

const prisma = new PrismaClient();

const toBytes = (value: string) => Buffer.from(value, 'utf8');

const syntheticDocs = {
  adminCpf: '00000000001',
  managerHorizonteCpf: '00000000002',
  operatorHorizonteCpf: '00000000003',
  viewerHorizonteCpf: '00000000004',
  workerHorizonteCpf: '00000000011',
  workerSemOperacaoCpf: '00000000012',
  workerDesligadoCpf: '00000000013',
  managerLesteCpf: '00000000022',
  workerLesteCpf: '00000000023',
  pisAdmin: '90000000001',
  pisManager: '90000000002',
  pisOperator: '90000000003',
  pisViewer: '90000000004',
  pisWorkerA: '90000000011',
  pisWorkerB: '90000000012',
  pisWorkerC: '90000000013',
  pisManagerLeste: '90000000022',
  pisWorkerLeste: '90000000023',
  rgAdmin: '990000001',
  rgManager: '990000002',
  rgOperator: '990000003',
  rgViewer: '990000004',
  rgWorkerA: '990000011',
  rgWorkerB: '990000012',
  rgWorkerC: '990000013',
  rgManagerLeste: '990000022',
  rgWorkerLeste: '990000023',
} as const;

const LEVEL_DEFINITIONS = [
  { levelNumber: 1, levelName: 'Beginner', xpRequired: 100 },
  { levelNumber: 2, levelName: 'Amateur', xpRequired: 167 },
  { levelNumber: 3, levelName: 'Apprentice', xpRequired: 278 },
  { levelNumber: 4, levelName: 'Collector', xpRequired: 464 },
  { levelNumber: 5, levelName: 'Professional', xpRequired: 774 },
  { levelNumber: 6, levelName: 'Expert', xpRequired: 1291 },
  { levelNumber: 7, levelName: 'Master', xpRequired: 2154 },
  { levelNumber: 8, levelName: 'Elite', xpRequired: 3593 },
  { levelNumber: 9, levelName: 'Champion', xpRequired: 5992 },
  { levelNumber: 10, levelName: 'Legend', xpRequired: 10000 },
] as const;

const ACHIEVEMENT_DEFINITIONS = [
  {
    achievementKey: 'WEIGHT_50KG',
    achievementName: 'Beginner',
    description: 'Collect 50 kg of materials in a month',
    category: 'WEIGHT',
    thresholdValue: '50.00',
    baseXpReward: 100,
    difficulty: 'EASY',
  },
  {
    achievementKey: 'WEIGHT_100KG',
    achievementName: 'Amateur',
    description: 'Collect 100 kg of materials in a month',
    category: 'WEIGHT',
    thresholdValue: '100.00',
    baseXpReward: 200,
    difficulty: 'EASY',
  },
  {
    achievementKey: 'WEIGHT_250KG',
    achievementName: 'Professional',
    description: 'Collect 250 kg of materials in a month',
    category: 'WEIGHT',
    thresholdValue: '250.00',
    baseXpReward: 400,
    difficulty: 'MEDIUM',
  },
  {
    achievementKey: 'WEIGHT_500KG',
    achievementName: 'Master Collector',
    description: 'Collect 500 kg of materials in a month',
    category: 'WEIGHT',
    thresholdValue: '500.00',
    baseXpReward: 750,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'WEIGHT_1000KG',
    achievementName: 'Legendary Collector',
    description: 'Collect 1000 kg of materials in a month',
    category: 'WEIGHT',
    thresholdValue: '1000.00',
    baseXpReward: 1500,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'DAYS_5',
    achievementName: 'Getting Started',
    description: 'Work at least 5 days in a month',
    category: 'DAYS_WORKED',
    thresholdValue: '5.00',
    baseXpReward: 75,
    difficulty: 'EASY',
  },
  {
    achievementKey: 'DAYS_10',
    achievementName: 'On a Roll',
    description: 'Work at least 10 days in a month',
    category: 'DAYS_WORKED',
    thresholdValue: '10.00',
    baseXpReward: 150,
    difficulty: 'MEDIUM',
  },
  {
    achievementKey: 'DAYS_15',
    achievementName: 'Committed Worker',
    description: 'Work at least 15 days in a month',
    category: 'DAYS_WORKED',
    thresholdValue: '15.00',
    baseXpReward: 250,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'DAYS_20',
    achievementName: 'Dedicated Worker',
    description: 'Work at least 20 days in a month',
    category: 'DAYS_WORKED',
    thresholdValue: '20.00',
    baseXpReward: 400,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'DAYS_25',
    achievementName: 'Unstoppable Worker',
    description: 'Work at least 25 days in a month',
    category: 'DAYS_WORKED',
    thresholdValue: '25.00',
    baseXpReward: 600,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'ACHIEVEMENTS_COUNT_3',
    achievementName: 'Rising Star',
    description: 'Unlock 3 different achievements in a month',
    category: 'ACHIEVEMENTS_COUNT',
    thresholdValue: '3.00',
    baseXpReward: 125,
    difficulty: 'MEDIUM',
  },
  {
    achievementKey: 'ACHIEVEMENTS_COUNT_5',
    achievementName: 'Shining Star',
    description: 'Unlock 5 different achievements in a month',
    category: 'ACHIEVEMENTS_COUNT',
    thresholdValue: '5.00',
    baseXpReward: 300,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'ACHIEVEMENTS_COUNT_8',
    achievementName: 'Superstar',
    description: 'Unlock 8 different achievements in a month',
    category: 'ACHIEVEMENTS_COUNT',
    thresholdValue: '8.00',
    baseXpReward: 500,
    difficulty: 'HARD',
  },
  {
    achievementKey: 'ACHIEVEMENTS_COUNT_10',
    achievementName: 'Legendary Superstar',
    description: 'Unlock 10 different achievements in a month',
    category: 'ACHIEVEMENTS_COUNT',
    thresholdValue: '10.00',
    baseXpReward: 750,
    difficulty: 'HARD',
  },
] as const;

async function createWorker({
  workerName,
  cooperativeId,
  cpf,
  pis,
  rg,
  userType,
  email,
  passwordHash,
  birthDate,
  enterDate,
  exitDate = null,
  gender = 'Nao informado',
}: {
  workerName: string;
  cooperativeId: bigint;
  cpf: string;
  pis: string;
  rg: string;
  userType: 'A' | 'M' | '0' | '1';
  email: string;
  passwordHash: string;
  birthDate: string;
  enterDate: string;
  exitDate?: string | null;
  gender?: string | null;
}) {
  return prisma.workers.create({
    data: {
      workerName,
      cooperative: cooperativeId,
      cpf: toBytes(cpf),
      userType,
      birthDate: new Date(birthDate),
      enterDate: new Date(enterDate),
      exitDate: exitDate ? new Date(exitDate) : null,
      pis: toBytes(pis),
      rg: toBytes(rg),
      gender,
      password: toBytes(passwordHash),
      email,
      lastUpdate: new Date('2026-05-13'),
    },
  });
}

async function main() {
  assertSafeSeedTarget();

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "leaderboard_entry", "leaderboard_snapshot", "worker_achievement", "worker_level", "achievement_xp_override", "achievement_definition", "level_definition", "cooperative_random_multiplier", "cooperative_material_multiplier", "notice_board", "Worker_contributions", "collective_sale_contribution", "collective_sale", "material_bag_state", "Stock", "Measurments", "Sales", "Devices", "Workers", "Buyers", "Materials", "Groups", "Cooperative" RESTART IDENTITY CASCADE;',
  );

  await prisma.levelDefinition.createMany({
    data: [...LEVEL_DEFINITIONS],
    skipDuplicates: true,
  });

  await prisma.achievementDefinition.createMany({
    data: [...ACHIEVEMENT_DEFINITIONS],
    skipDuplicates: true,
  });

  const [cooperativeHorizonte, cooperativeLeste, cooperativeNorte] = await Promise.all([
    prisma.cooperative.create({
      data: { cooperativeName: 'Cooperativa UAT Horizonte' },
    }),
    prisma.cooperative.create({
      data: { cooperativeName: 'Cooperativa UAT Leste' },
    }),
    prisma.cooperative.create({
      data: { cooperativeName: 'Cooperativa UAT Norte' },
    }),
  ]);

  const [groupPaper, groupPlastic, groupMetal, groupGlass] = await Promise.all([
    prisma.groups.create({ data: { groupName: 'Papeis UAT' } }),
    prisma.groups.create({ data: { groupName: 'Plasticos UAT' } }),
    prisma.groups.create({ data: { groupName: 'Metais UAT' } }),
    prisma.groups.create({ data: { groupName: 'Vidros UAT' } }),
  ]);

  const [materialCardboard, materialPet, materialAluminum, materialGlassNoStock] =
    await Promise.all([
      prisma.materials.create({
        data: {
          materialName: 'UAT Papelao Ondulado',
          materialGroup: groupPaper.groupId,
        },
      }),
      prisma.materials.create({
        data: {
          materialName: 'UAT Plastico PET Cristal',
          materialGroup: groupPlastic.groupId,
        },
      }),
      prisma.materials.create({
        data: {
          materialName: 'UAT Aluminio Prensado',
          materialGroup: groupMetal.groupId,
        },
      }),
      prisma.materials.create({
        data: {
          materialName: 'UAT Vidro Misto Sem Estoque',
          materialGroup: groupGlass.groupId,
        },
      }),
    ]);

  const [deviceHorizonteScale, deviceHorizonteBackup, deviceLesteScale] =
    await Promise.all([
      prisma.devices.create({
        data: { cooperativeId: cooperativeHorizonte.cooperativeId },
      }),
      prisma.devices.create({
        data: { cooperativeId: cooperativeHorizonte.cooperativeId },
      }),
      prisma.devices.create({
        data: { cooperativeId: cooperativeLeste.cooperativeId },
      }),
    ]);

  const [buyerCity, buyerEco, buyerCollective] = await Promise.all([
    prisma.buyers.create({ data: { buyerName: 'UAT Recicla Cidades' } }),
    prisma.buyers.create({ data: { buyerName: 'UAT Eco Verde Comercial' } }),
    prisma.buyers.create({ data: { buyerName: 'UAT Comprador Venda Coletiva' } }),
  ]);

  const adminPassword = await bcrypt.hash('uat-admin-123', 10);
  const managerPassword = await bcrypt.hash('uat-manager-123', 10);
  const operatorPassword = await bcrypt.hash('uat-operator-123', 10);
  const viewerPassword = await bcrypt.hash('uat-viewer-123', 10);
  const workerPassword = await bcrypt.hash('uat-worker-123', 10);

  const admin = await createWorker({
    workerName: 'Admin UAT Sistema',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.adminCpf,
    pis: syntheticDocs.pisAdmin,
    rg: syntheticDocs.rgAdmin,
    userType: 'A',
    email: 'admin.uat@dms.local',
    passwordHash: adminPassword,
    birthDate: '1982-01-10',
    enterDate: '2020-01-01',
  });

  const managerHorizonte = await createWorker({
    workerName: 'Gerente UAT Horizonte',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.managerHorizonteCpf,
    pis: syntheticDocs.pisManager,
    rg: syntheticDocs.rgManager,
    userType: 'M',
    email: 'gerente.horizonte@dms.local',
    passwordHash: managerPassword,
    birthDate: '1987-04-12',
    enterDate: '2021-02-01',
    gender: 'Feminino',
  });

  const operatorHorizonte = await createWorker({
    workerName: 'Operador UAT Horizonte',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.operatorHorizonteCpf,
    pis: syntheticDocs.pisOperator,
    rg: syntheticDocs.rgOperator,
    userType: '0',
    email: 'operador.horizonte@dms.local',
    passwordHash: operatorPassword,
    birthDate: '1990-06-18',
    enterDate: '2022-03-01',
    gender: 'Masculino',
  });

  const viewerHorizonte = await createWorker({
    workerName: 'Visualizador UAT Horizonte',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.viewerHorizonteCpf,
    pis: syntheticDocs.pisViewer,
    rg: syntheticDocs.rgViewer,
    userType: '0',
    email: 'viewer.horizonte@dms.local',
    passwordHash: viewerPassword,
    birthDate: '1992-09-21',
    enterDate: '2022-05-01',
    gender: 'Nao informado',
  });

  const workerAtivo = await createWorker({
    workerName: 'Trabalhadora UAT Ativa',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.workerHorizonteCpf,
    pis: syntheticDocs.pisWorkerA,
    rg: syntheticDocs.rgWorkerA,
    userType: '1',
    email: 'trabalhadora.ativa@dms.local',
    passwordHash: workerPassword,
    birthDate: '1994-03-03',
    enterDate: '2022-01-15',
    gender: 'Feminino',
  });

  const workerSemOperacao = await createWorker({
    workerName: 'Trabalhador UAT Sem Operacao',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.workerSemOperacaoCpf,
    pis: syntheticDocs.pisWorkerB,
    rg: syntheticDocs.rgWorkerB,
    userType: '1',
    email: 'trabalhador.sem.operacao@dms.local',
    passwordHash: workerPassword,
    birthDate: '1991-07-19',
    enterDate: '2024-01-10',
    gender: 'Masculino',
  });

  const workerDesligado = await createWorker({
    workerName: 'Trabalhadora UAT Desligada',
    cooperativeId: cooperativeHorizonte.cooperativeId,
    cpf: syntheticDocs.workerDesligadoCpf,
    pis: syntheticDocs.pisWorkerC,
    rg: syntheticDocs.rgWorkerC,
    userType: '1',
    email: 'trabalhadora.desligada@dms.local',
    passwordHash: workerPassword,
    birthDate: '1989-11-02',
    enterDate: '2020-09-01',
    exitDate: '2026-01-31',
    gender: 'Feminino',
  });

  const managerLeste = await createWorker({
    workerName: 'Gerente UAT Leste',
    cooperativeId: cooperativeLeste.cooperativeId,
    cpf: syntheticDocs.managerLesteCpf,
    pis: syntheticDocs.pisManagerLeste,
    rg: syntheticDocs.rgManagerLeste,
    userType: 'M',
    email: 'gerente.leste@dms.local',
    passwordHash: managerPassword,
    birthDate: '1984-08-08',
    enterDate: '2021-08-01',
    gender: 'Feminino',
  });

  const workerLeste = await createWorker({
    workerName: 'Trabalhador UAT Leste',
    cooperativeId: cooperativeLeste.cooperativeId,
    cpf: syntheticDocs.workerLesteCpf,
    pis: syntheticDocs.pisWorkerLeste,
    rg: syntheticDocs.rgWorkerLeste,
    userType: '1',
    email: 'trabalhador.leste@dms.local',
    passwordHash: workerPassword,
    birthDate: '1993-12-04',
    enterDate: '2023-02-01',
    gender: 'Masculino',
  });

  await prisma.noticeBoard.createMany({
    data: [
      {
        cooperativeId: null,
        createdAt: new Date('2026-05-13T08:00:00Z'),
        lastUpdated: new Date('2026-05-13T08:00:00Z'),
        createdBy: admin.workerId,
        priority: 1,
        expiresAt: new Date('2026-06-30T23:59:59Z'),
        title: sanitizeNoticeTitle('UAT Aviso global seguro'),
        content: sanitizeNoticeContent(
          '<p>Agenda de prestação de contas disponível para as cooperativas.</p>',
        ),
      },
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        createdAt: new Date('2026-05-13T09:00:00Z'),
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
        createdBy: managerHorizonte.workerId,
        priority: 2,
        expiresAt: new Date('2026-06-15T23:59:59Z'),
        title: sanitizeNoticeTitle('UAT Horizonte - coleta antecipada'),
        content: sanitizeNoticeContent(
          '<p>Coleta de PET antecipada para <strong>sexta-feira</strong>.</p>',
        ),
      },
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        createdAt: new Date('2026-05-13T10:00:00Z'),
        lastUpdated: new Date('2026-05-13T10:00:00Z'),
        createdBy: managerHorizonte.workerId,
        priority: 3,
        expiresAt: new Date('2026-06-15T23:59:59Z'),
        title: sanitizeNoticeTitle('<img src=x onerror=alert(1)> UAT payload bloqueado'),
        content: sanitizeNoticeContent(
          '<p>Conteudo permitido</p><img src=x onerror=alert(1)><script>alert(document.cookie)</script>',
        ),
      },
    ],
  });

  await prisma.cooperativeMaterialMultiplier.createMany({
    data: [
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        materialId: materialCardboard.materialId,
        multiplierValue: '1.250',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        materialId: materialPet.materialId,
        multiplierValue: '1.100',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        cooperativeId: cooperativeLeste.cooperativeId,
        materialId: materialCardboard.materialId,
        multiplierValue: '0.950',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
    ],
  });

  await prisma.cooperativeRandomMultiplier.createMany({
    data: [
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        multiplierValue: '1.100',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        cooperativeId: cooperativeLeste.cooperativeId,
        multiplierValue: '0.900',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        cooperativeId: cooperativeNorte.cooperativeId,
        multiplierValue: '1.000',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
    ],
  });

  const [weight50Achievement, days5Achievement] = await Promise.all([
    prisma.achievementDefinition.findUniqueOrThrow({
      where: { achievementKey: 'WEIGHT_50KG' },
    }),
    prisma.achievementDefinition.findUniqueOrThrow({
      where: { achievementKey: 'DAYS_5' },
    }),
  ]);

  await prisma.achievementXpOverride.create({
    data: {
      cooperativeId: cooperativeHorizonte.cooperativeId,
      achievementId: weight50Achievement.achievementId,
      xpRewardOverride: 110,
      updatedBy: managerHorizonte.workerId,
      updatedAt: new Date('2026-05-13T09:00:00Z'),
    },
  });

  await prisma.workerLevel.createMany({
    data: [
      {
        workerId: workerAtivo.workerId,
        totalXp: 75,
        currentLevel: 1,
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        workerId: workerSemOperacao.workerId,
        totalXp: 0,
        currentLevel: 1,
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
    ],
  });

  await prisma.workerAchievement.createMany({
    data: [
      {
        workerId: workerAtivo.workerId,
        achievementId: weight50Achievement.achievementId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        yearMonth: '2026-05',
        unlockedAt: null,
        progressValue: '48.10',
      },
      {
        workerId: workerAtivo.workerId,
        achievementId: days5Achievement.achievementId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        yearMonth: '2026-05',
        unlockedAt: new Date('2026-05-13T09:00:00Z'),
        progressValue: '5.00',
      },
    ],
  });

  const leaderboardSnapshot = await prisma.leaderboardSnapshot.create({
    data: {
      cooperativeId: cooperativeHorizonte.cooperativeId,
      yearMonth: '2026-05',
      weekNumber: 1,
      computedAt: new Date('2026-05-13T09:00:00Z'),
    },
  });

  await prisma.leaderboardEntry.createMany({
    data: [
      {
        snapshotId: leaderboardSnapshot.snapshotId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        rankPosition: 1,
        workerId: workerAtivo.workerId,
        workerName: workerAtivo.workerName,
        rawXp: '210.50',
        finalXp: '231.55',
        randomMult: '1.100',
      },
      {
        snapshotId: leaderboardSnapshot.snapshotId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        rankPosition: 2,
        workerId: workerSemOperacao.workerId,
        workerName: workerSemOperacao.workerName,
        rawXp: '0.00',
        finalXp: '0.00',
        randomMult: '1.100',
      },
    ],
  });

  await prisma.measurments.createMany({
    data: [
      {
        weightKg: '135.50',
        timeStamp: new Date('2026-05-01'),
        wastepicker: workerAtivo.workerId,
        material: materialCardboard.materialId,
        device: deviceHorizonteScale.deviceId,
        bagFilled: true,
      },
      {
        weightKg: '92.40',
        timeStamp: new Date('2026-05-02'),
        wastepicker: workerAtivo.workerId,
        material: materialPet.materialId,
        device: deviceHorizonteBackup.deviceId,
        bagFilled: true,
      },
      {
        weightKg: '48.10',
        timeStamp: new Date('2026-05-03'),
        wastepicker: workerAtivo.workerId,
        material: materialAluminum.materialId,
        device: deviceHorizonteScale.deviceId,
        bagFilled: false,
      },
      {
        weightKg: '88.60',
        timeStamp: new Date('2026-05-04'),
        wastepicker: workerLeste.workerId,
        material: materialCardboard.materialId,
        device: deviceLesteScale.deviceId,
        bagFilled: true,
      },
    ],
  });

  await prisma.sales.createMany({
    data: [
      {
        date: new Date('2026-05-05'),
        createdAt: new Date('2026-05-05T09:00:00Z'),
        soldAt: new Date('2026-05-05T15:00:00Z'),
        cancelledAt: null,
        material: materialCardboard.materialId,
        weight: '120.00',
        priceKg: '1.35',
        buyer: buyerCity.buyerId,
        responsible: managerHorizonte.workerId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        expectedSaleDate: new Date('2026-05-05T15:00:00Z'),
      },
      {
        date: new Date('2026-05-07'),
        createdAt: new Date('2026-05-07T09:00:00Z'),
        soldAt: null,
        cancelledAt: null,
        material: materialPet.materialId,
        weight: '85.00',
        priceKg: '2.40',
        buyer: buyerEco.buyerId,
        responsible: operatorHorizonte.workerId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        expectedSaleDate: new Date('2026-05-15T15:00:00Z'),
      },
      {
        date: new Date('2026-05-08'),
        createdAt: new Date('2026-05-08T09:00:00Z'),
        soldAt: null,
        cancelledAt: new Date('2026-05-08T16:00:00Z'),
        material: materialAluminum.materialId,
        weight: '35.00',
        priceKg: '4.10',
        buyer: buyerCollective.buyerId,
        responsible: admin.workerId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        expectedSaleDate: new Date('2026-05-12T15:00:00Z'),
      },
      {
        date: new Date('2026-05-09'),
        createdAt: new Date('2026-05-09T09:00:00Z'),
        soldAt: new Date('2026-05-09T15:00:00Z'),
        cancelledAt: null,
        material: materialCardboard.materialId,
        weight: '40.00',
        priceKg: '1.28',
        buyer: buyerCity.buyerId,
        responsible: managerLeste.workerId,
        cooperativeId: cooperativeLeste.cooperativeId,
        expectedSaleDate: new Date('2026-05-09T15:00:00Z'),
      },
    ],
  });

  await prisma.stock.createMany({
    data: [
      {
        cooperative: cooperativeHorizonte.cooperativeId,
        material: materialCardboard.materialId,
        totalCollectedKg: '350.00',
        totalSoldKg: '120.00',
        currentStockKg: '230.00',
      },
      {
        cooperative: cooperativeHorizonte.cooperativeId,
        material: materialPet.materialId,
        totalCollectedKg: '260.00',
        totalSoldKg: '0.00',
        currentStockKg: '260.00',
      },
      {
        cooperative: cooperativeHorizonte.cooperativeId,
        material: materialAluminum.materialId,
        totalCollectedKg: '10.00',
        totalSoldKg: '0.00',
        currentStockKg: '10.00',
      },
      {
        cooperative: cooperativeHorizonte.cooperativeId,
        material: materialGlassNoStock.materialId,
        totalCollectedKg: '0.00',
        totalSoldKg: '0.00',
        currentStockKg: '0.00',
      },
      {
        cooperative: cooperativeLeste.cooperativeId,
        material: materialCardboard.materialId,
        totalCollectedKg: '120.00',
        totalSoldKg: '40.00',
        currentStockKg: '80.00',
      },
    ],
  });

  await prisma.materialBagState.createMany({
    data: [
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        materialId: materialAluminum.materialId,
        isBegun: true,
        currentKg: '10.00',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
      {
        cooperativeId: cooperativeHorizonte.cooperativeId,
        materialId: materialGlassNoStock.materialId,
        isBegun: false,
        currentKg: '0.00',
        lastUpdated: new Date('2026-05-13T09:00:00Z'),
      },
    ],
  });

  const [collectiveOpenTwoCoops, collectiveContributionPending] = await Promise.all([
    prisma.collectiveSale.create({
      data: {
        createdAt: new Date('2026-05-10T09:00:00Z'),
        soldAt: null,
        cancelledAt: null,
        buyerId: buyerCollective.buyerId,
        materialId: materialPet.materialId,
        totalWeight: null,
        priceKg: '2.65',
        expectedSaleDate: new Date('2026-05-20T15:00:00Z'),
        creatorCooperativeId: cooperativeHorizonte.cooperativeId,
      },
    }),
    prisma.collectiveSale.create({
      data: {
        createdAt: new Date('2026-05-11T09:00:00Z'),
        soldAt: null,
        cancelledAt: null,
        buyerId: buyerCollective.buyerId,
        materialId: materialCardboard.materialId,
        totalWeight: null,
        priceKg: '1.50',
        expectedSaleDate: new Date('2026-05-22T15:00:00Z'),
        creatorCooperativeId: cooperativeLeste.cooperativeId,
      },
    }),
  ]);

  await prisma.collectiveSaleContribution.createMany({
    data: [
      {
        collectiveSaleId: collectiveOpenTwoCoops.collectiveSaleId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        contributedWeight: null,
        revenueShare: null,
        status: 'ACCEPTED',
      },
      {
        collectiveSaleId: collectiveOpenTwoCoops.collectiveSaleId,
        cooperativeId: cooperativeLeste.cooperativeId,
        contributedWeight: null,
        revenueShare: null,
        status: 'INVITED',
      },
      {
        collectiveSaleId: collectiveOpenTwoCoops.collectiveSaleId,
        cooperativeId: cooperativeNorte.cooperativeId,
        contributedWeight: null,
        revenueShare: null,
        status: 'INVITED',
      },
      {
        collectiveSaleId: collectiveContributionPending.collectiveSaleId,
        cooperativeId: cooperativeLeste.cooperativeId,
        contributedWeight: '0.00',
        revenueShare: null,
        status: 'ACCEPTED',
      },
      {
        collectiveSaleId: collectiveContributionPending.collectiveSaleId,
        cooperativeId: cooperativeHorizonte.cooperativeId,
        contributedWeight: '0.00',
        revenueShare: null,
        status: 'ACCEPTED',
      },
      {
        collectiveSaleId: collectiveContributionPending.collectiveSaleId,
        cooperativeId: cooperativeNorte.cooperativeId,
        contributedWeight: '0.00',
        revenueShare: null,
        status: 'ACCEPTED',
      },
    ],
  });

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Worker_contributions"
      ("Wastepicker", "Material", cooperative, "Period", "Weight_KG", "Last_updated")
    VALUES
      (${workerAtivo.workerId}, ${materialCardboard.materialId}, ${cooperativeHorizonte.cooperativeId}, daterange('2026-05-01', '2026-05-31', '[]'), 210.50, '2026-05-10'),
      (${workerAtivo.workerId}, ${materialPet.materialId}, ${cooperativeHorizonte.cooperativeId}, daterange('2026-05-01', '2026-05-31', '[]'), 92.40, '2026-05-10'),
      (${workerLeste.workerId}, ${materialCardboard.materialId}, ${cooperativeLeste.cooperativeId}, daterange('2026-05-01', '2026-05-31', '[]'), 88.60, '2026-05-10');
  `);

  console.log('UAT seed completed for disposable local/preview data.');
  console.log('Synthetic accounts:');
  console.log('- Admin: 00000000001 / uat-admin-123');
  console.log('- Manager Horizonte: 00000000002 / uat-manager-123');
  console.log('- Operator persona Horizonte: 00000000003 / uat-operator-123');
  console.log('- Viewer persona Horizonte: 00000000004 / uat-viewer-123');
  console.log('- Manager Leste: 00000000022 / uat-manager-123');
  console.log('- Worker web-denied fixture: 00000000011 / uat-worker-123');
  console.log(
    `Additional fixtures: viewer=${viewerHorizonte.workerId}, emptyWorker=${workerSemOperacao.workerId}, inactiveWorker=${workerDesligado.workerId}.`,
  );
  console.log('See Web_vault/Operacao/Seed-e-dados-locais.md for the UAT matrix.');
}

main()
  .catch((error) => {
    console.error('UAT seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
