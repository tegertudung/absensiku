import { prisma } from '../utils/prisma';

export async function listAuditLogs(filters: { tableName?: string; recordId?: string }) {
  const logs = await prisma.auditLog.findMany({
    where: {
      tableName: filters.tableName,
      recordId: filters.recordId,
    },
    orderBy: { changedAt: 'desc' },
    take: 200,
  });

  // changedBy is a plain string field (no Prisma relation to User), so resolve
  // display emails with a small manual lookup rather than a schema relation.
  const userIds = [...new Set(logs.map((l) => l.changedBy).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return logs.map((l) => ({
    ...l,
    changedByEmail: l.changedBy ? emailById.get(l.changedBy) ?? null : null,
  }));
}
