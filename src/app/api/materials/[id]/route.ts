import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type MaterialWithGroup = Prisma.MaterialsGetPayload<{
  include: { group: true };
}>;

function parseMaterialId(id: string) {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}

function formatMaterial(material: MaterialWithGroup) {
  return {
    _id: material.materialId.toString(),
    material_id: Number(material.materialId),
    material: material.materialName,
    name: material.materialName,
    group: material.group?.groupName ?? '',
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = parseMaterialId(idParam);
    if (id === null) {
      return NextResponse.json(
        { error: 'ID de material inválido' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const materialName = body.material?.trim();
    const groupName = body.group?.trim();

    if (!materialName || !groupName) {
      return NextResponse.json(
        { error: 'Nome do material e grupo são obrigatórios' },
        { status: 400 },
      );
    }

    const existingMaterial = await prisma.materials.findUnique({
      where: { materialId: id },
      include: { group: true },
    });

    if (!existingMaterial) {
      return NextResponse.json(
        { error: 'Material não encontrado' },
        { status: 404 },
      );
    }

    const duplicateMaterial = await prisma.materials.findFirst({
      where: {
        materialId: { not: id },
        materialName: {
          equals: materialName,
          mode: 'insensitive',
        },
      },
    });

    if (duplicateMaterial) {
      return NextResponse.json(
        { error: 'Já existe outro material com este nome' },
        { status: 400 },
      );
    }

    let group = await prisma.groups.findFirst({
      where: {
        groupName: {
          equals: groupName,
          mode: 'insensitive',
        },
      },
    });

    if (!group) {
      group = await prisma.groups.create({
        data: { groupName },
      });
    }

    const updatedMaterial = await prisma.materials.update({
      where: { materialId: id },
      data: {
        materialName,
        materialGroup: group.groupId,
      },
      include: { group: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Material atualizado com sucesso',
      material: formatMaterial(updatedMaterial as MaterialWithGroup),
    });
  } catch (error) {
    console.error('Error updating material:', error);
    return NextResponse.json(
      {
        error: 'Erro ao atualizar material',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = parseMaterialId(idParam);
    if (id === null) {
      return NextResponse.json(
        { error: 'ID de material inválido' },
        { status: 400 },
      );
    }

    const existingMaterial = await prisma.materials.findUnique({
      where: { materialId: id },
    });

    if (!existingMaterial) {
      return NextResponse.json(
        { error: 'Material não encontrado' },
        { status: 404 },
      );
    }

    const [measurementUsage, salesUsage, stockUsage, contributionUsage] =
      await Promise.all([
        prisma.measurments.count({ where: { material: id } }),
        prisma.sales.count({ where: { material: id } }),
        prisma.stock.count({ where: { material: id } }),
        prisma.workerContributions.count({ where: { material: id } }),
      ]);

    if (
      measurementUsage > 0 ||
      salesUsage > 0 ||
      stockUsage > 0 ||
      contributionUsage > 0
    ) {
      return NextResponse.json(
        {
          error:
            'Este material não pode ser excluído pois está sendo usado em medições, vendas, estoque ou contribuições',
        },
        { status: 400 },
      );
    }

    await prisma.materials.delete({
      where: { materialId: id },
    });

    return NextResponse.json({
      success: true,
      message: 'Material excluído com sucesso',
    });
  } catch (error) {
    console.error('Error deleting material:', error);
    return NextResponse.json(
      {
        error: 'Erro ao excluir material',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
