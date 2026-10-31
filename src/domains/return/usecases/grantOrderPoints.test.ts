import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { cron } from "#/crons/sweep-orders";
import { returnsTable, returnWindowsTable } from "#/db/schema";
import { shipOrder as shipOrderOnly } from "#/domains/order/index";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  fixed500,
  inNovember,
  place,
  pointsOf,
  put,
  shippedOrder,
  withPoints,
  type Order,
} from "../../../../test/helpers";
import { grantOrderPoints } from "./grantOrderPoints";

// Shipped 2026-11-15 10:00 +09:00: returns are taken until 2026-11-29 10:00 +09:00
const deadline = new Date("2026-11-29T10:00:00+09:00");
const justAfter = new Date(deadline.getTime() + 1);

const sweep = (now: Date) => cron.run({ deps: makeDeps(env), now });

/** The order's return window; none yet is version 0 with nothing closed */
const rowOf = async (id: string) => {
  const [row] = await db()
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, id));
  return row ?? { pointsClosedAt: null, pointsEarnedAt: null, version: 0 };
};

const ask = async (who: Parameters<typeof request>[0], order: Order, quantity = 1) =>
  (await (
    await request(
      who,
      "POST",
      `/orders/${order.id}/returns`,
      { lines: [{ orderLineId: order.lines[0]!.id, quantity }] },
      inNovember,
    )
  ).json()) as { id: string };

it("earns 1% of the books after the period is over, not the shipping fee; not at the deadline itself", async () => {
  const me = someone();
  // 1,990 + 550 shipping: 1% of the books is 19, of the total would be 25
  await put(me, await bookWith(1990, 5), 1);
  const order = await shippedOrder(me);

  await sweep(deadline);
  expect(await pointsOf(me)).toBe(0);
  expect((await rowOf(order.id)).pointsClosedAt).toBeNull();

  await sweep(justAfter);
  expect(await pointsOf(me)).toBe(19);
  expect(await rowOf(order.id)).toMatchObject({
    pointsClosedAt: expect.any(Date),
    pointsEarnedAt: expect.any(Date),
  });
});

it("earns once however many times the cron runs", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  await shippedOrder(me);

  await sweep(justAfter);
  await sweep(new Date(justAfter.getTime() + 15 * 60 * 1000));
  await sweep(new Date(justAfter.getTime() + 30 * 60 * 1000));

  expect(await pointsOf(me)).toBe(50);
});

it("earns on what was paid with points too", async () => {
  const me = someone();
  await put(me, await bookWith(3000, 5), 1);
  await withPoints(me, 3000);
  const placed = (await (await place(me, undefined, 3000)).json()) as Order;
  await request(carol, "POST", `/orders/${placed.id}/ship`, undefined, inNovember);
  expect(await pointsOf(me)).toBe(0);

  await sweep(justAfter);

  expect(await pointsOf(me)).toBe(30);
});

it("earns on the books after the coupon, less the money given back for returned books (the design's example: 3,500 − 500 − 1,285)", async () => {
  const me = someone();
  await put(me, await bookWith(2000, 5), 1);
  await put(me, await bookWith(1500, 5), 1);
  const order = await shippedOrder(me, await fixed500());
  const returned = (await (
    await request(
      me,
      "POST",
      `/orders/${order.id}/returns`,
      { lines: [{ orderLineId: order.lines[1]!.id, quantity: 1 }] },
      inNovember,
    )
  ).json()) as { id: string };
  await request(carol, "POST", `/returns/${returned.id}/receive`, undefined, inNovember);

  await sweep(justAfter);

  expect(await pointsOf(me)).toBe(17);
});

it("skips an order with a return waiting, and earns once the return is decided", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const waiting = await ask(me, order);

  await sweep(justAfter);
  expect(await pointsOf(me)).toBe(0);
  expect((await rowOf(order.id)).pointsClosedAt).toBeNull();

  await request(
    carol,
    "POST",
    `/returns/${waiting.id}/reject`,
    { reason: "汚れている" },
    inNovember,
  );
  await sweep(new Date(justAfter.getTime() + 15 * 60 * 1000));

  expect(await pointsOf(me)).toBe(50);
});

it("skips an order whose return is completed but not refunded yet (the receive is between its steps)", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const returned = await ask(me, order);
  // receiveReturn wrote 1 (completed) and not yet 2 (the refund)
  await db()
    .update(returnsTable)
    .set({ status: "completed", completedAt: inNovember })
    .where(eq(returnsTable.id, returned.id));

  await grantOrderPoints(makeDeps(env), { id: order.id, now: justAfter });
  expect(await pointsOf(me)).toBe(0);
  expect((await rowOf(order.id)).pointsClosedAt).toBeNull();

  // The cron finishes the receive first, then earns on what is left: nothing
  await sweep(justAfter);
  await sweep(new Date(justAfter.getTime() + 15 * 60 * 1000));
  expect(await pointsOf(me)).toBe(0);
  expect((await rowOf(order.id)).pointsEarnedAt).toEqual(expect.any(Date));
});

it("earns nothing on an order whose books were all returned, and does not try again", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const returned = await ask(me, order);
  await request(carol, "POST", `/returns/${returned.id}/receive`, undefined, inNovember);

  await sweep(justAfter);

  expect(await pointsOf(me)).toBe(0);
  expect((await rowOf(order.id)).pointsEarnedAt).toEqual(expect.any(Date));
});

it("a close that stopped before earning is finished by the cron, and the points are earned once", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  await sweep(justAfter);
  // The Worker died after the close and the earning, before the record
  await db()
    .update(returnWindowsTable)
    .set({ pointsEarnedAt: null })
    .where(eq(returnWindowsTable.orderId, order.id));

  await sweep(new Date(justAfter.getTime() + 15 * 60 * 1000));

  expect(await pointsOf(me)).toBe(50);
  expect((await rowOf(order.id)).pointsEarnedAt).toEqual(expect.any(Date));
});

it("a close moves the return window's version, so a return that read the window before it loses", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const before = await rowOf(order.id);

  await grantOrderPoints(makeDeps(env), { id: order.id, now: justAfter });

  expect((await rowOf(order.id)).version).toBe(before.version + 1);
});

it("does nothing for an order that is not shipped", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = (await (await place(me)).json()) as Order;

  const result = await grantOrderPoints(makeDeps(env), { id: order.id, now: justAfter });

  expect(result).toMatchObject({ ok: false, error: { code: "ORDER_STATUS_CONFLICT" } });
});

it("shipping opens the order's return window, with when it was shipped", async () => {
  const me = someone();
  await put(me, await bookWith(1990, 5), 1);
  const order = await shippedOrder(me);

  const [row] = await db()
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, order.id));
  expect(row).toMatchObject({ shippedAt: inNovember, pointsClosedAt: null });
});

it("a ship that stopped before opening the window gets it from the cron, and the order still earns", async () => {
  const me = someone();
  await put(me, await bookWith(1990, 5), 1);
  const placed = (await (await place(me)).json()) as Order;
  await request(me, "POST", `/orders/${placed.id}/pay`, undefined, inNovember);
  // Shipped in order, and stopped before return opened the window
  await shipOrderOnly(makeDeps(env), { id: placed.id, now: inNovember });

  await sweep(new Date(inNovember.getTime() + 15 * 60 * 1000));
  const [row] = await db()
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, placed.id));
  expect(row).toMatchObject({ shippedAt: inNovember });

  await sweep(justAfter);
  expect(await pointsOf(me)).toBe(19);
});
