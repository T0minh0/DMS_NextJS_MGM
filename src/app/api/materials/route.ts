import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type MaterialWithGroup = Prisma.MaterialsGetPayload<{
  include: { group: true };
}>;

function formatMaterial(material: MaterialWithGroup) {
  return {
    _id: material.materialId.toString(),
    material_id: Number(material.materialId),
    material: material.materialName,
    name: material.materialName,
    group: material.group?.groupName ?? '',
  };
}

export async function GET() {
  try {
    const materials = await prisma.materials.findMany({
      include: { group: true },
      orderBy: { materialName: 'asc' },
    });

    const formattedMaterials = materials.map((material) =>
      formatMaterial(material as MaterialWithGroup),
    );

    const uniqueGroups = Array.from(
      new Set(
        formattedMaterials
          .map((material) => material.group)
          .filter((groupName): groupName is string => Boolean(groupName)),
      ),
    );

    const groupObjects = uniqueGroups.map((groupName) => ({
      _id: `group-${groupName}`,
      group: groupName,
      isGroup: true,
    }));

    return NextResponse.json([...groupObjects, ...formattedMaterials]);
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch materials',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const materialName = body.material?.trim();
    const groupName = body.group?.trim();

    if (!materialName || !groupName) {
      return NextResponse.json(
        { error: 'Nome do material e grupo são obrigatórios' },
        { status: 400 },
      );
    }

    const existingMaterial = await prisma.materials.findFirst({
      where: {
        materialName: {
          equals: materialName,
          mode: 'insensitive',
        },
      },
    });

    if (existingMaterial) {
      return NextResponse.json(
        { error: 'Este material já existe' },
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

    const createdMaterial = await prisma.materials.create({
      data: {
        materialName,
        materialGroup: group.groupId,
      },
      include: { group: true },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Material criado com sucesso',
        materialId: createdMaterial.materialId.toString(),
        material: formatMaterial(createdMaterial as MaterialWithGroup),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating material:', error);
    return NextResponse.json(
      {
        error: 'Erro ao criar material',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}