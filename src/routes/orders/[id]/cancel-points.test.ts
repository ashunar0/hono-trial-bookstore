import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { ordersTable, refundsTable } from "#/db/schema";
import { usePoints } from "#/domains/point/index";
import { cron } from "#/crons/sweep-orders";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  place,
  pointsOf,
  put,
  stockOf,
  withPoints,
  type Order,
} from "../_test-helpers";

const cancel = (who: Parameters<typeof request>[0], order: Order) =>
  request(who, "POST", `/orders/${order.id}/cancel`, { version: order.version }, inNovember);
const pay = (who: Parameters<typeof request>[0], id: string) =>
  request(who, "POST", `/orders/${id}/pay`, undefined, inNovember);
const refundsOf = (orderId: string) =>
  db().select().from(refundsTable).where(eq(refundsTable.orderId, orderId));

/** A customer with 1,000 points who placed a 3,200 yen book with 500 of them */
const placedWithPoints = async () => {
  const me = someone();
  const book = await bookWith(3200, 5);
  await put(me, book, 1);
  await withPoints(me, 1000);
  const order = (await (await place(me, undefined, 500)).json()) as Order;
  return { me, book, order };
};

it("cancelling an unpaid order gives all the points back as points; nothing is refunded", async () => {
  const { me, book, order } = await placedWithPoints();
  expect(await pointsOf(me)).toBe(500);

  const res = await cancel(me, order);

  expect(await res.json()).toMatchObject({ status: "cancelled", refunds: [] });
  expect(await pointsOf(me)).toBe(1000);
  expect(await stockOf(book)).toBe(5);
});

it("cancelling a paid order refunds the whole total: the points as points, the rest to the card", async () => {
  const { me, order } = await placedWithPoints();
  const paid = (await (await pay(me, order.id)).json()) as Order;

  const res = await cancel(carol, paid);

  expect(res.status).toBe(200);
  expect(await pointsOf(me)).toBe(1000);
  expect(await refundsOf(order.id)).toMatchObject([{ amount: 3200, pointsAmount: 500, tax: 290 }]);
});

it("cancelling an order the points paid whole gives all of it back as points", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  await withPoints(me, 1550);
  const order = (await (await place(me, undefined, 1550)).json()) as Order;
  expect(order.status).toBe("paid");

  await cancel(me, order);

  expect(await pointsOf(me)).toBe(1550);
  expect(await refundsOf(order.id)).toMatchObject([{ amount: 1550, pointsAmount: 1550 }]);
});

it("an order without points refunds no points", async () => {
  const me = someone();
  await put(me, await bookWith(2000, 5), 1);
  const order = (await (await place(me)).json()) as Order;
  const paid = (await (await pay(me, order.id)).json()) as Order;

  await cancel(me, paid);

  expect(await refundsOf(order.id)).toMatchObject([{ amount: 2550, pointsAmount: 0 }]);
});

it("the points come back once, whoever cancels and however many times the giving back runs", async () => {
  const { me, order } = await placedWithPoints();
  await cancel(me, order);
  // The cron runs the giving back again on a cancelled order whose record is gone (the Worker died at the end)
  await db().update(ordersTable).set({ restoredAt: null }).where(eq(ordersTable.id, order.id));

  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-15T11:00:00+09:00") });
  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-15T11:15:00+09:00") });

  expect(await pointsOf(me)).toBe(1000);
});

it("the cron cancelling an order left placing before it used its points gives back no points out of nothing", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  await withPoints(me, 100);
  const placedAt = new Date("2026-11-15T10:00:00+09:00");
  const id = crypto.randomUUID();
  await db()
    .insert(ordersTable)
    .values({
      id,
      customerId: me.id,
      status: "placing",
      subtotal: 1000,
      discount: 0,
      shippingFee: 550,
      total: 1550,
      tax: 140,
      pointsUsed: 300,
      pointUseId: crypto.randomUUID(),
      earnId: crypto.randomUUID(),
      reservationId: crypto.randomUUID(),
      paymentDueAt: new Date("2026-11-18T10:00:00+09:00"),
      version: 1,
      createdAt: placedAt,
      updatedAt: placedAt,
    });

  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-15T10:10:00+09:00") });

  const [row] = await db().select().from(ordersTable).where(eq(ordersTable.id, id));
  expect(row?.status).toBe("cancelled");
  expect(await pointsOf(me)).toBe(100);
  expect(await stockOf(book)).toBe(5);
});

it("the cron cancelling an order left placing after it used its points gives them back", async () => {
  const me = someone();
  await withPoints(me, 100);
  const placedAt = new Date("2026-11-15T10:00:00+09:00");
  const id = crypto.randomUUID();
  const pointUseId = crypto.randomUUID();
  await db()
    .insert(ordersTable)
    .values({
      id,
      customerId: me.id,
      status: "placing",
      subtotal: 1000,
      discount: 0,
      shippingFee: 550,
      total: 1550,
      tax: 140,
      pointsUsed: 80,
      pointUseId,
      earnId: crypto.randomUUID(),
      reservationId: crypto.randomUUID(),
      paymentDueAt: new Date("2026-11-18T10:00:00+09:00"),
      version: 1,
      createdAt: placedAt,
      updatedAt: placedAt,
    });
  await usePoints(makeDeps(env), {
    useId: pointUseId,
    customerId: userId(me.id),
    points: 80,
    now: placedAt,
  });
  expect(await pointsOf(me)).toBe(20);

  await cron.run({ deps: makeDeps(env), now: new Date("2026-11-15T10:10:00+09:00") });

  expect(await pointsOf(me)).toBe(100);
});
