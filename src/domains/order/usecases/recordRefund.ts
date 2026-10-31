import { ok, type DepsVariables } from "hono-kit";
import { taxWithin } from "#/domains/pricing/rules";
import { insertRefund } from "../mutations";
import { refundIdOf } from "../rules";

type Input = {
  orderId: string;
  /** What is refunded: the id of the refund is fixed by it, so recording twice adds nothing */
  of: { returnId: string };
  /** Yen, tax included */
  amount: number;
  /** The part of amount given back as points; the rest goes back to the card */
  points: number;
  now: Date;
};

/**
 * Records money given back for something other than a cancel (a return). Refunds are order's, as the payment is:
 * return decides how much, and order writes it down. The tax is taken once on the whole amount, as for an order.
 * Safe to run again with the same `of`
 */
export const recordRefund = async (deps: DepsVariables["deps"], input: Input) => {
  await insertRefund(deps.db, {
    id: refundIdOf(input.of),
    orderId: input.orderId,
    returnId: input.of.returnId,
    amount: input.amount,
    pointsAmount: input.points,
    tax: taxWithin(input.amount),
    createdAt: input.now,
  });

  return ok({ refundId: refundIdOf(input.of) });
};
