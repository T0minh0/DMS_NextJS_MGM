import { Prisma } from '@prisma/client';
import type { AuthSession } from '@/lib/auth/shared';

export interface NoticeRow {
  noticeId: bigint;
  cooperativeId: bigint | null;
  createdAt: Date;
  lastUpdated: Date;
  createdBy: bigint;
  priority: number;
  expiresAt: Date | null;
  title: string;
  content: string;
}

export function formatNotice(n: NoticeRow) {
  return {
    _id: n.noticeId.toString(),
    cooperative_id: n.cooperativeId?.toString() ?? null,
    created_at: n.createdAt.toISOString(),
    last_updated: n.lastUpdated.toISOString(),
    created_by: n.createdBy.toString(),
    priority: n.priority,
    expires_at: n.expiresAt?.toISOString() ?? null,
    title: n.title,
    content: n.content,
    is_global: n.cooperativeId === null,
  };
}

export function buildScopeWhere(session: AuthSession): Prisma.NoticeBoardWhereInput {
  if (session.role === 'admin') return {};
  return {
    OR: [
      { cooperativeId: null },
      { cooperativeId: BigInt(session.cooperativeId) },
    ],
  };
}

export function buildActiveWhere(): Prisma.NoticeBoardWhereInput {
  return {
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  };
}
