import { z } from "zod";
import type { pointEntriesTable } from "#/db/schema";
import { pointKinds } from "#/domains/point/rules";

type EntryRow = typeof pointEntriesTable.$inferSelect;

export const balanceResponseSchema = z.object({
  /** Points the customer has, in yen. 0 for one who never had any */
  balance: z.number(),
});

/** One line of the statement */
export const entryResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(pointKinds),
  /** Negative when points were used */
  amount: z.number(),
  createdAt: z.string(),
});

export const entryResponse = (row: EntryRow): z.infer<typeof entryResponseSchema> => ({
  id: row.id,
  kind: row.kind,
  amount: row.amount,
  createdAt: row.createdAt.toISOString(),
});
