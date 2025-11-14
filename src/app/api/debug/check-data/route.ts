import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber, formatWorkerId } from '@/lib/db-utils';

export async function GET() {
  try {
    const [workers, measurments, contributions, materials] = await Promise.all([
      prisma.workers.findMany({
        where: { userType: '1' },
        take: 3,
        orderBy: { workerId: 'asc' },
        select: {
          workerId: true,
          workerName: true,
          userType: true,
          cpf: true,
        },
      }),
      prisma.measurments.findMany({
        take: 3,
        orderBy: { timeStamp: 'desc' },
        select: {
          weightingId: true,
          weightKg: true,
          wastepicker: true,
          material: true,
          timeStamp: true,
          bagFilled: true,
        },
      }),
      prisma.workerContributions.findMany({
        take: 3,
        orderBy: { lastUpdated: 'desc' },
        select: {
          contributionId: true,
          wastepicker: true,
          material: true,
          weightKg: true,
          period: true,
        },
      }),
      prisma.materials.findMany({
        take: 3,
        orderBy: { materialId: 'asc' },
        select: {
          materialId: true,
          materialName: true,
        },
      }),
    ]);

    const [workersCount, measurmentsCount, contributionsCount, materialsCount] = await Promise.all([
      prisma.workers.count({ where: { userType: '1' } }),
      prisma.measurments.count(),
      prisma.workerContributions.count(),
      prisma.materials.count(),
    ]);

    const debugInfo = {
      timestamp: new Date().toISOString(),
      workers: {
        total: workersCount,
        withWastepickerId: workersCount,
        withoutWastepickerId: 0,
        sample: workers.map((worker) => ({
          id: worker.workerId.toString(),
          full_name: worker.workerName,
          user_type: worker.userType,
          wastepicker_id: formatWorkerId(worker.workerId),
        })),
      },
      measurements: {
        total: measurmentsCount,
        sample: measurments.map((measurement) => ({
          id: measurement.weightingId.toString(),
          weightKg: decimalToNumber(measurement.weightKg) ?? 0,
          wastepicker: measurement.wastepicker.toString(),
          material: measurement.material.toString(),
          timestamp: measurement.timeStamp,
          bagFilled: measurement.bagFilled,
        })),
      },
      worker_contributions: {
        total: contributionsCount,
        sample: contributions.map((contribution) => ({
          id: contribution.contributionId.toString(),
          wastepicker: contribution.wastepicker.toString(),
          material: contribution.material.toString(),
          weightKg: decimalToNumber(contribution.weightKg) ?? 0,
          period: contribution.period ? String(contribution.period) : null,
        })),
      },
      materials: {
        total: materialsCount,
        sample: materials.map((material) => ({
          id: material.materialId.toString(),
          name: material.materialName,
        })),
      },
    };

    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug check error:', error);
    return NextResponse.json(
      {
        error: 'Debug check failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
