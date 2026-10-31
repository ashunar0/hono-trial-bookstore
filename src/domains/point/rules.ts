/**
 * Points. Imports nothing but zod. 1 point is 1 yen
 */
import { z } from "zod";

export const pointKinds = ["use", "restore", "earn"] as const;

export type PointKind = (typeof pointKinds)[number];

/** What a customer earns on this many yen: 1%, dropping the fraction */
export const earnedOf = (yen: number) => Math.floor(yen / 100);

/** The id of the entry that gives back a use, fixed by the use: giving back twice adds nothing */
export const restoreIdOfUse = (useId: string) => `restore-${useId}`;

/** The id of the entry that gives back the points of one return, fixed by the return */
export const restoreIdOfReturn = (returnId: string) => `restore-return-${returnId}`;

/** The same for the points of one exchange that ended in a refund, fixed by the exchange */
export const restoreIdOfExchange = (exchangeId: string) => `restore-exchange-${exchangeId}`;

export const PointsInsufficient = {
  code: "POINTS_INSUFFICIENT",
  kind: "conflict",
  message: "There are not enough points (or another order used them first)",
  /** What the customer has now */
  details: z.object({ balance: z.number() }),
} as const;
