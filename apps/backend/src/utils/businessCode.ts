import type { Prisma } from "@prisma/client";

type DatabaseClient = Prisma.TransactionClient;

const sequenceByEntity = {
  tutor: '"Tutor_tutorCode_seq"',
  student: '"Student_studentCode_seq"',
  parent: '"Parent_parentCode_seq"',
} as const;

const prefixByEntity = {
  tutor: "TTR",
  student: "SIS",
  parent: "ORT",
} as const;

/**
 * PostgreSQL sequences allocate each number atomically, so concurrent create
 * requests cannot receive the same display/business identifier. The database
 * unique constraints remain the final protection layer.
 */
export async function nextBusinessCode(
  db: DatabaseClient,
  entity: keyof typeof sequenceByEntity,
) {
  const rows = await db.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval(${sequenceByEntity[entity]}::regclass) AS value
  `;
  const value = String(rows[0].value);
  return `${prefixByEntity[entity]}-${value.padStart(4, "0")}`;
}
