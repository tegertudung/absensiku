import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * BR-13 / K.Validasi "Audit koreksi": every admin correction to an important
 * or historical record gets a traceable entry — who, when, old value, new
 * value, why. Values must already be JSON-safe (e.g. Prisma Decimal fields
 * converted via .toString() by the caller) since the Json column can't
 * serialize a Decimal instance directly.
 */
export async function logAudit(
  params: {
    tableName: string;
    recordId: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    changedBy?: string | null;
    reason?: string;
  },
  db: Db = defaultPrisma
) {
  await db.auditLog.create({
    data: {
      tableName: params.tableName,
      recordId: params.recordId,
      action: params.action,
      oldValues: (params.oldValues as Prisma.InputJsonValue) ?? undefined,
      newValues: (params.newValues as Prisma.InputJsonValue) ?? undefined,
      changedBy: params.changedBy ?? undefined,
      reason: params.reason,
    },
  });
}
