import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { returnsTable, refundsTable } from "#/db/schema";
import { cron } from "#/crons/sweep-orders";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  place,
  pointsOf,
  put,
  withPoints,
  type Order,
} from "../../../../../test/helpers";

/** Places with points, pays and ships (in November) */
const shippedWithPoints = async (who: ReturnType<typeof someone>, points?: number) => {
  const placed = (await (await place(who, undefined, points)).json()) as Order;
  if (placed.status !== "paid")
    await request(who, "POST", `/orders/${placed.id}/pay`, undefined, inNovember);
  return (await (
    await request(carol, "POST", `/orders/${placed.id}/ship`, undefined, inNovember)
  ).json()) as Order;
};

const returnCopies = async (
  who: ReturnType<typeof someone>,
  order: Order,
  line: number,
  quantity: number,
) => {
  const asked = (await (
    await request(
      who,
      "POST",
      `/orders/${order.id}/returns`,
      { lines: [{ orderLineId: order.lines[line]!.id, quantity }] },
      inNovember,
    )
  ).json()) as { id: string };
  const res = await request(carol, "POST", `/returns/${asked.id}/receive`, undefined, inNovember);
  expect(res.status).toBe(200);
  return asked.id;
};

const refundOfReturn = async (returnId: string) => {
  const [row] = await db().select().from(refundsTable).where(eq(refundsTable.returnId, returnId));
  return row;
};

it("the design's example: two 1,600 yen books paid with 500 points and 2,700 yen; one back is 250 points and 1,350 yen, whichever comes first", async () => {
  const me = someone();
  await put(me, await bookWith(1600, 5), 2);
  await withPoints(me, 500);
  const order = await shippedWithPoints(me, 500);
  expect(await pointsOf(me)).toBe(0);

  const first = await returnCopies(me, order, 0, 1);
  expect(await refundOfReturn(first)).toMatchObject({ amount: 1600, pointsAmount: 250 });
  expect(await pointsOf(me)).toBe(250);

  const second = await returnCopies(me, order, 0, 1);
  expect(await refundOfReturn(second)).toMatchObject({ amount: 1600, pointsAmount: 250 });
  expect(await pointsOf(me)).toBe(500);
});

it("copies of a line come back with the points shared the same way as the discount: 33, 33, 34", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 3);
  await withPoints(me, 100);
  const order = await shippedWithPoints(me, 100);

  const ids = [
    await returnCopies(me, order, 0, 1),
    await returnCopies(me, order, 0, 1),
    await returnCopies(me, order, 0, 1),
  ];

  const refunds = await Promise.all(ids.map(refundOfReturn));
  expect(refunds.map((r) => r?.pointsAmount)).toEqual([33, 33, 34]);
  expect(await pointsOf(me)).toBe(100);
});

it("the points shared to the shipping fee do not come back on a return, as the fee does not", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  await withPoints(me, 500);
  const order = await shippedWithPoints(me, 500);

  const returned = await returnCopies(me, order, 0, 1);

  // 323 went to the book and 177 to the fee
  expect(await refundOfReturn(returned)).toMatchObject({ amount: 1000, pointsAmount: 323 });
  expect(await pointsOf(me)).toBe(323);
});

it("a return of an order paid without points gives back no points", async () => {
  const me = someone();
  await put(me, await bookWith(2000, 5), 1);
  const order = await shippedWithPoints(me);

  const returned = await returnCopies(me, order, 0, 1);

  expect(await refundOfReturn(returned)).toMatchObject({ amount: 2000, pointsAmount: 0 });
  expect(await pointsOf(me)).toBe(0);
});

it("a receive that stopped before giving the points back is finished by the cron, once", async () => {
  const me = someone();
  await put(me, await bookWith(1600, 5), 2);
  await withPoints(me, 500);
  const order = await shippedWithPoints(me, 500);
  const returned = await returnCopies(me, order, 0, 1);
  expect(await pointsOf(me)).toBe(250);
  // The record that it was all done is lost, as if the Worker died after the points and before the record
  await db().update(returnsTable).set({ restoredAt: null }).where(eq(returnsTable.id, returned));

  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-16T00:00:00+09:00") });
  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-16T00:15:00+09:00") });

  expect(await pointsOf(me)).toBe(250);
  expect(
    await db().select().from(refundsTable).where(eq(refundsTable.returnId, returned)),
  ).toHaveLength(1);
});
