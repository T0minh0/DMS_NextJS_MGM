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

function parseGroupId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) return null;

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

async function findExistingGroup(body: Record<string, unknown>) {
  const groupId = parseGroupId(body.group_id ?? body.groupId);

  if (groupId !== null) {
    return prisma.groups.findUnique({
      where: { groupId },
    });
  }

  const groupName = typeof body.group === 'string' ? body.group.trim() : '';
  if (!groupName) return null;

  return prisma.groups.findFirst({
    where: {
      groupName: {
        equals: groupName,
        mode: 'insensitive',
      },
    },
  });
}

function formatMaterial(material: MaterialWithGroup) {
  return {
    _id: material.materialId.toString(),
    material_id: material.materialId.toString(),
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

function materialGroupNotFoundResponse() {
  return apiErrorResponse({
    message: 'Selecione um grupo de material cadastrado',
    code: 'MATERIAL_GROUP_NOT_FOUND',
    status: 400,
  });
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

    const body = await request.json() as Record<string, unknown>;
    const materialName = typeof body.material === 'string' ? body.material.trim() : '';

    if (!materialName) {
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

    const group = await findExistingGroup(body);
    if (!group) {
      return materialGroupNotFoundResponse();
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
