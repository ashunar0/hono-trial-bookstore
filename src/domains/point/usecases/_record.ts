import type { DepsVariables } from "hono-kit";
import { uniqueViolationOf } from "hono-kit/sqlite";
import type { PointKind } from "../rules";
import { writeEntry } from "../mutations";

type Entry = {
  /** Made by the caller and kept by it, so a second run with it adds nothing */
  id: string;
  customerId: string;
  kind: PointKind;
  /** Negative for a use */
  amount: number;
  now: Date;
};

/**
 * Writes one entry and moves the balance, in one batch. Returns true when it wrote, false when the id was already
 * there ("already done", not a failure). Anything else that stops the batch (the balance CHECK) is thrown:
 * the caller that can fail on it reads the balance
 */
export const record = async (deps: DepsVariables["deps"], entry: Entry) => {
  const { db } = deps;
  try {
    await db.batch(
      writeEntry(db, {
        id: entry.id,
        customerId: entry.customerId,
        kind: entry.kind,
        amount: entry.amount,
        createdAt: entry.now,
      }),
    );
  } catch (error) {
    if (uniqueViolationOf(error) === "point_entries.id") return false;
    throw error;
  }
  return true;
};
