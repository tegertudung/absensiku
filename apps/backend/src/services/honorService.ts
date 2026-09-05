import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../utils/prisma";
import { endOfBusinessDate, startOfBusinessDate } from "../utils/businessDate";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * BR-08/BR-09: find the honor rate that was in effect on a given session date.
 * Callers must store the returned nominal as an immutable snapshot on the
 * session — never re-look-up the rate later when displaying historical data.
 */
export async function getApplicableHonorRate(
  programId: string,
  sessionDate: Date,
  db: Db = defaultPrisma,
) {
  const sessionDayStart = startOfBusinessDate(sessionDate);
  const sessionDayEnd = endOfBusinessDate(sessionDate);

  return db.honorRate.findFirst({
    where: {
      programId,
      status: "ACTIVE",
      // Rates are calendar-day rules. The day range keeps a rate entered as
      // YYYY-MM-DD valid throughout that same session date, including records
      // created before date-only parsing was normalized.
      effectiveFrom: { lte: sessionDayEnd },
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: sessionDayStart } },
          ],
        },
      ],
    },
    orderBy: [{ programId: "desc" }, { effectiveFrom: "desc" }],
  });
}
