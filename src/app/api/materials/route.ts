import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { authErrorResponse, requireAdmin, requireManagerOrAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

type MaterialWithGroup = Prisma.MaterialsGetPayload<{
  include: { group: true };
}>;

function formatMaterial(material: MaterialWithGroup) {
  return {
    _id: material.materialId.toString(),
    material_id: material.materialId.toString(),
    material: material.materialName,
    name: material.materialName,
    group: material.group?.groupName ?? '',
  };
}

export async function GET(request: Request) {
  try {
    await requireManagerOrAdmin();
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
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Failed to fetch materials',
      code: 'MATERIALS_READ_FAILED',
      route: '/api/materials',
      method: 'GET',
      request,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const materialName = body.material?.trim();
    const groupName = body.group?.trim();

    if (!materialName || !groupName) {
      return apiErrorResponse({
        message: 'Nome do material e grupo são obrigatórios',
        code: 'REQUIRED_MATERIAL_FIELDS',
        status: 400,
      });
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
      return apiErrorResponse({
        message: 'Este material já existe',
        code: 'MATERIAL_NAME_CONFLICT',
        status: 400,
      });
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
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao criar material',
      code: 'MATERIAL_CREATE_FAILED',
      route: '/api/materials',
      method: 'POST',
      request,
    });
  }
}
