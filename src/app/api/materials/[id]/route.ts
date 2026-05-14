import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { authErrorResponse, requireAdmin } from '@/lib/auth/server';
import { apiErrorResponse, apiRouteErrorResponse } from '@/lib/api/errors';

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

function materialDeleteDependencyResponse() {
  return apiErrorResponse({
    message:
      'Este material não pode ser excluído pois está sendo usado em medições, vendas, vendas coletivas, estoque ou contribuições',
    code: 'MATERIAL_DELETE_HAS_DEPENDENCIES',
    status: 400,
  });
}

function isForeignKeyConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id: idParam } = await params;
    const id = parseMaterialId(idParam);
    if (id === null) {
      return apiErrorResponse({
        message: 'ID de material inválido',
        code: 'INVALID_MATERIAL_ID',
        status: 400,
      });
    }

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

    const existingMaterial = await prisma.materials.findUnique({
      where: { materialId: id },
      include: { group: true },
    });

    if (!existingMaterial) {
      return apiErrorResponse({
        message: 'Material não encontrado',
        code: 'MATERIAL_NOT_FOUND',
        status: 404,
      });
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
      return apiErrorResponse({
        message: 'Já existe outro material com este nome',
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
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao atualizar material',
      code: 'MATERIAL_UPDATE_FAILED',
      route: '/api/materials/[id]',
      method: 'PUT',
      request,
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id: idParam } = await params;
    const id = parseMaterialId(idParam);
    if (id === null) {
      return apiErrorResponse({
        message: 'ID de material inválido',
        code: 'INVALID_MATERIAL_ID',
        status: 400,
      });
    }

    const existingMaterial = await prisma.materials.findUnique({
      where: { materialId: id },
    });

    if (!existingMaterial) {
      return apiErrorResponse({
        message: 'Material não encontrado',
        code: 'MATERIAL_NOT_FOUND',
        status: 404,
      });
    }

    const [
      measurementUsage,
      salesUsage,
      stockUsage,
      contributionUsage,
      collectiveSaleUsage,
    ] =
      await Promise.all([
        prisma.measurments.count({ where: { material: id } }),
        prisma.sales.count({ where: { material: id } }),
        prisma.stock.count({ where: { material: id } }),
        prisma.workerContributions.count({ where: { material: id } }),
        prisma.collectiveSale.count({ where: { materialId: id } }),
      ]);

    if (
      measurementUsage > 0 ||
      salesUsage > 0 ||
      stockUsage > 0 ||
      contributionUsage > 0 ||
      collectiveSaleUsage > 0
    ) {
      return materialDeleteDependencyResponse();
    }

    try {
      await prisma.materials.delete({
        where: { materialId: id },
      });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        return materialDeleteDependencyResponse();
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Material excluído com sucesso',
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, _request);
    if (authResponse) {
      return authResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao excluir material',
      code: 'MATERIAL_DELETE_FAILED',
      route: '/api/materials/[id]',
      method: 'DELETE',
      request: _request,
    });
  }
}
