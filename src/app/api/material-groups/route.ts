import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  apiErrorResponse,
  apiRequestErrorResponse,
  apiRouteErrorResponse,
  readJsonBody,
} from '@/lib/api/errors';
import { authErrorResponse, requireAdmin, requireManagerOrAdmin } from '@/lib/auth/server';

type MaterialGroup = {
  groupId: bigint;
  groupName: string;
};

function formatGroup(group: MaterialGroup) {
  return {
    group_id: group.groupId.toString(),
    group: group.groupName,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireManagerOrAdmin();

    const groups = await prisma.groups.findMany({
      orderBy: { groupName: 'asc' },
    });

    return NextResponse.json({
      groups: groups.map(formatGroup),
      count: groups.length,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    const requestErrorResponse = apiRequestErrorResponse(error);
    if (requestErrorResponse) {
      return requestErrorResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao carregar grupos de materiais',
      code: 'MATERIAL_GROUPS_READ_FAILED',
      route: '/api/material-groups',
      method: 'GET',
      request,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await readJsonBody(request);
    const groupName = typeof body.group === 'string' ? body.group.trim() : '';

    if (!groupName) {
      return apiErrorResponse({
        message: 'Nome do grupo e obrigatorio',
        code: 'REQUIRED_MATERIAL_GROUP_NAME',
        status: 400,
      });
    }

    const existingGroup = await prisma.groups.findFirst({
      where: {
        groupName: {
          equals: groupName,
          mode: 'insensitive',
        },
      },
    });

    if (existingGroup) {
      return apiErrorResponse({
        message: 'Este grupo de materiais ja existe',
        code: 'MATERIAL_GROUP_NAME_CONFLICT',
        status: 409,
      });
    }

    const createdGroup = await prisma.groups.create({
      data: { groupName },
    });
    const formattedGroup = formatGroup(createdGroup);

    return NextResponse.json(
      {
        success: true,
        message: 'Grupo de materiais criado com sucesso',
        group_id: formattedGroup.group_id,
        group: formattedGroup.group,
      },
      { status: 201 },
    );
  } catch (error) {
    const authResponse = authErrorResponse(error, request);
    if (authResponse) {
      return authResponse;
    }

    const requestErrorResponse = apiRequestErrorResponse(error);
    if (requestErrorResponse) {
      return requestErrorResponse;
    }

    return apiRouteErrorResponse({
      error,
      message: 'Erro ao criar grupo de materiais',
      code: 'MATERIAL_GROUP_CREATE_FAILED',
      route: '/api/material-groups',
      method: 'POST',
      request,
    });
  }
}
