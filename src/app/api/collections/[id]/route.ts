import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrorResponse, determineTargetCooperative, requireManagerOrAdmin, requireScopedPermission } from '@/lib/auth/server';
import { apiErrorResponse, apiInternalErrorResponse, apiRequestErrorResponse, readJsonBody } from '@/lib/api/errors';
import { CollectionDeletionError, deleteCollection, parseCollectionDeletion } from '@/lib/materials/delete-collection';
import { createLogContext, logInfo } from '@/lib/observability/logger';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createLogContext(request, { domain: 'stock', route: '/api/collections/[id]' });
  try {
    const session = await requireManagerOrAdmin();
    requireScopedPermission(session, 'stock', 'delete', 'cooperative');
    const cooperativeId = BigInt(determineTargetCooperative(session, new URL(request.url).searchParams.get('cooperative_id'), { required: true }));
    const { id } = await params;
    const parsed = parseCollectionDeletion(id, await readJsonBody(request));
    const result = await prisma.$transaction(tx => deleteCollection(tx, { ...parsed, cooperativeId, session }), { timeout: 15_000 });
    logInfo('collection.delete.succeeded', context, { actorWorkerId: session.workerId, role: session.role, cooperativeId: cooperativeId.toString(), ...result });
    return NextResponse.json({ success: true, message: 'Pesagem excluída e estoque corrigido.', ...result });
  } catch (error) {
    const auth = authErrorResponse(error, context);
    if (auth) return auth;
    if (error instanceof CollectionDeletionError) {
      return apiErrorResponse({ message: error.message, code: error.code, status: error.status, requestId: context.requestId });
    }
    const invalid = apiRequestErrorResponse(error, context.requestId);
    if (invalid) return invalid;
    return apiInternalErrorResponse({ message: 'Não foi possível excluir a pesagem.', code: 'COLLECTION_DELETE_FAILED', context, event: 'collection.delete.failed', error });
  }
}
