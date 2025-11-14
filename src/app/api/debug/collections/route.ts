import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

export async function GET() {
  try {
    const samples = await Promise.all([
      prisma.workers.findFirst({
        orderBy: { workerId: 'asc' },
      }),
      prisma.materials.findFirst({
        orderBy: { materialId: 'asc' },
      }),
      prisma.sales.findFirst({
        orderBy: { date: 'desc' },
      }),
      prisma.measurments.findFirst({
        orderBy: { timeStamp: 'desc' },
      }),
      prisma.stock.findFirst({
        orderBy: { stockId: 'asc' },
      }),
      prisma.workerContributions.findFirst({
        orderBy: { contributionId: 'asc' },
      }),
    ]);

    const collections = [
      {
        name: 'Workers',
        sample: samples[0]
          ? {
              workerId: samples[0]!.workerId.toString(),
              workerName: samples[0]!.workerName,
              userType: samples[0]!.userType,
              email: samples[0]!.email,
            }
          : null,
      },
      {
        name: 'Materials',
        sample: samples[1]
          ? {
              materialId: samples[1]!.materialId.toString(),
              materialName: samples[1]!.materialName,
            }
          : null,
      },
      {
        name: 'Sales',
        sample: samples[2]
          ? {
              saleId: samples[2]!.saleId.toString(),
              material: samples[2]!.material.toString(),
              buyer: samples[2]!.buyer.toString(),
              priceKg: decimalToNumber(samples[2]!.priceKg) ?? 0,
              weight: decimalToNumber(samples[2]!.weight) ?? 0,
              date: samples[2]!.date,
            }
          : null,
      },
      {
        name: 'Measurments',
        sample: samples[3]
          ? {
              weightingId: samples[3]!.weightingId.toString(),
              weightKg: decimalToNumber(samples[3]!.weightKg) ?? 0,
              wastepicker: samples[3]!.wastepicker.toString(),
              material: samples[3]!.material.toString(),
              timeStamp: samples[3]!.timeStamp,
            }
          : null,
      },
      {
        name: 'Stock',
        sample: samples[4]
          ? {
              stockId: samples[4]!.stockId.toString(),
              material: samples[4]!.material.toString(),
              totalCollectedKg: decimalToNumber(samples[4]!.totalCollectedKg) ?? 0,
              currentStockKg: decimalToNumber(samples[4]!.currentStockKg) ?? 0,
            }
          : null,
      },
      {
        name: 'WorkerContributions',
        sample: samples[5]
          ? {
              contributionId: samples[5]!.contributionId.toString(),
              wastepicker: samples[5]!.wastepicker.toString(),
              material: samples[5]!.material.toString(),
              weightKg: decimalToNumber(samples[5]!.weightKg) ?? 0,
              period: samples[5]!.period ? String(samples[5]!.period) : null,
            }
          : null,
      },
    ];

    return NextResponse.json({
      collections: collections.map((collection) => collection.name),
      samples: collections.reduce<Record<string, unknown>>((acc, collection) => {
        acc[collection.name] = collection.sample ?? { message: 'Sem dados' };
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { message: 'Error fetching collections', error: String(error) },
      { status: 500 },
    );
  }
}
