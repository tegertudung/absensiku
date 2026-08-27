import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../utils/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * BR-08/BR-09: find the honor rate that was in effect on a given session date.
 * Callers must store the returned nominal as an immutable snapshot on the
 * session — never re-look-up the rate later when displaying historical data.
 */
export async function getApplicableHonorRate(
  sessionType: 'REGULAR' | 'PRIVATE',
  sessionDate: Date,
  db: Db = defaultPrisma
) {
  return db.honorRate.findFirst({
    where: {
      sessionType,
      status: 'ACTIVE',
      effectiveFrom: { lte: sessionDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: sessionDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}
