import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decimalToNumber } from '@/lib/db-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialIdParam = searchParams.get('material_id');

    const materials = await prisma.materials.findMany({
      include: { group: true },
    });

    const materialNameById = new Map<bigint, string>();
    const materialIdByGroup = new Map<string, bigint[]>();
    materials.forEach((material) => {
      materialNameById.set(material.materialId, material.materialName);
      if (material.group) {
        const ids = materialIdByGroup.get(material.group.groupName) || [];
        ids.push(material.materialId);
        materialIdByGroup.set(material.group.groupName, ids);
      }
    });

    let materialFilter: bigint[] | null = null;

    if (materialIdParam) {
      if (materialIdParam.startsWith('group_')) {
        const groupName = materialIdParam.replace('group_', '');
        const ids = materialIdByGroup.get(groupName);
        if (!ids || ids.length === 0) {
          return NextResponse.json({
            noData: true,
            message: 'Não há materiais neste grupo',
          });
        }
        materialFilter = ids;
      } else {
        try {
          materialFilter = [BigInt(materialIdParam)];
        } catch {
          return NextResponse.json({ noData: true, message: 'Material inválido' }, { status: 400 });
        }
      }
    }

    const stocks = await prisma.stock.findMany({
      where: materialFilter ? { material: { in: materialFilter } } : undefined,
      include: {
        materialRef: true,
        cooperativeRef: true,
      },
    });

    if (stocks.length === 0) {
      return NextResponse.json({
        noData: true,
        message: materialIdParam
          ? 'Não há estoque deste material ou foi totalmente vendido'
          : 'Não há estoque disponível ou todos os materiais foram vendidos',
      });
    }

    const formattedStock: Record<string, number> = {};

    stocks.forEach((stock) => {
      const name =
        materialNameById.get(stock.material) ||
        stock.materialRef?.materialName ||
        `Material ${stock.material.toString()}`;
      const current = decimalToNumber(stock.currentStockKg) ?? 0;
      formattedStock[name] = (formattedStock[name] || 0) + current;
    });

    return NextResponse.json(formattedStock);
  } catch (error) {
    console.error('Error fetching stock:', error);
    return NextResponse.json(
      {
        noData: true,
        message: 'Erro ao buscar dados de estoque. Por favor, tente novamente mais tarde.',
      },
      { status: 500 },
    );
  }
}
