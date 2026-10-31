import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { cron } from "#/crons/sweep-orders";
import { exchangesTable, refundsTable, returnWindowsTable } from "#/db/schema";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  pointsOf,
  put,
  shippedOrder,
  stockOf,
  type Order,
} from "../../../../test/helpers";
import { reserveStock } from "#/domains/inventory/index";
import { reservationIdOfExchange } from "../rules";
import { receiveExchange } from "./receiveExchange";

// Shipped 2026-11-15 10:00 +09:00: returns are taken until 2026-11-29 10:00 +09:00
const justAfter = new Date(new Date("2026-11-29T10:00:00+09:00").getTime() + 1);
const later = (minutes: number) => new Date(justAfter.getTime() + minutes * 60 * 1000);

const sweep = (now: Date) => cron.run({ deps: makeDeps(env), now });

const ask = async (who: Parameters<typeof request>[0], order: Order) =>
  (await (
    await request(
      who,
      "POST",
      `/orders/${order.id}/exchanges`,
      { reason: "damaged", lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] },
      inNovember,
    )
  ).json()) as { id: string };

const setStock = async (bookId: string, quantity: number) => {
  const book = (await (await request(null, "GET", `/books/${bookId}`)).json()) as {
    stock: { version: number };
  };
  await request(carol, "PUT", `/books/${bookId}/stock`, { quantity, version: book.stock.version });
};

const windowOf = async (orderId: string) => {
  const [row] = await db()
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, orderId));
  return row;
};

it("two receives of the last copy at once: the copy is held once, and the exchange is decided once", async () => {
  const me = someone();
  const book = await bookWith(1000, 2);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  expect(await stockOf(book)).toBe(1);

  const results = await Promise.all([
    receiveExchange(makeDeps(env), { exchangeId: asked.id, by: "staff", now: inNovember }),
    receiveExchange(makeDeps(env), { exchangeId: asked.id, by: "staff", now: inNovember }),
  ]);

  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const [row] = await db().select().from(exchangesTable).where(eq(exchangesTable.id, asked.id));
  // Whichever won, the stock agrees with it: held for a received one, kept (and a refund) for a refunded one
  if (row!.status === "received") {
    expect(await stockOf(book)).toBe(0);
  } else {
    expect(row!.status).toBe("refunded");
    expect(await stockOf(book)).toBe(1);
    expect(
      await db().select().from(refundsTable).where(eq(refundsTable.exchangeId, asked.id)),
    ).toHaveLength(1);
  }
});

it("a receive that held the last copy and stopped before switching is received when done again, not refunded", async () => {
  const me = someone();
  const book = await bookWith(1000, 2);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  // The first try held the copy under the exchange's id, then stopped
  await reserveStock(makeDeps(env), {
    reservationId: reservationIdOfExchange(asked.id),
    lines: [{ bookId: book, quantity: 1 }],
    now: inNovember,
  });
  expect(await stockOf(book)).toBe(0);

  const result = await receiveExchange(makeDeps(env), {
    exchangeId: asked.id,
    by: "staff",
    now: inNovember,
  });

  expect(result.ok && result.value.status).toBe("received");
  expect(await stockOf(book)).toBe(0);
  expect(
    await db().select().from(refundsTable).where(eq(refundsTable.exchangeId, asked.id)),
  ).toHaveLength(0);
});

it("a reject that stopped before giving the hold back is finished by the cron, and the copy goes back on sale", async () => {
  const me = someone();
  const book = await bookWith(1000, 2);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  // A receive held the copy and stopped; then a reject switched and stopped before giving it back
  await reserveStock(makeDeps(env), {
    reservationId: reservationIdOfExchange(asked.id),
    lines: [{ bookId: book, quantity: 1 }],
    now: inNovember,
  });
  await db()
    .update(exchangesTable)
    .set({ status: "rejected", rejectReason: "not damaged", rejectedAt: inNovember })
    .where(eq(exchangesTable.id, asked.id));
  expect(await stockOf(book)).toBe(0);

  await sweep(later(1));
  await sweep(later(16));

  expect(await stockOf(book)).toBe(1);
  const [row] = await db().select().from(exchangesTable).where(eq(exchangesTable.id, asked.id));
  expect(row).toMatchObject({ status: "rejected", restoredAt: later(1) });
});

it("a refunded exchange whose points were not recorded as back is finished by the cron, once", async () => {
  const me = someone();
  const book = await bookWith(1600, 5);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  await setStock(book, 0);
  await request(carol, "POST", `/exchanges/${asked.id}/receive`, undefined, inNovember);
  // The record that it was all done is lost, as if the Worker died after the refund and before the record
  await db()
    .update(exchangesTable)
    .set({ restoredAt: null })
    .where(eq(exchangesTable.id, asked.id));

  await sweep(new Date("2026-11-16T00:00:00+09:00"));
  await sweep(new Date("2026-11-16T00:15:00+09:00"));

  const [row] = await db().select().from(exchangesTable).where(eq(exchangesTable.id, asked.id));
  expect(row).toMatchObject({ status: "refunded", restoredAt: expect.any(Date) });
  expect(
    await db().select().from(refundsTable).where(eq(refundsTable.exchangeId, asked.id)),
  ).toHaveLength(1);
});

it("an order with an exchange waiting earns nothing until it is decided, then earns on all of it", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);

  await sweep(justAfter);
  expect(await pointsOf(me)).toBe(0);
  // Opened at the ship (1), moved by the request (2)
  expect(await windowOf(order.id)).toMatchObject({ pointsClosedAt: null, version: 2 });

  await request(carol, "POST", `/exchanges/${asked.id}/reject`, { reason: "x" }, inNovember);
  await sweep(later(15));

  expect(await pointsOf(me)).toBe(50);
});

it("a received exchange does not hold the points back: its money is decided, only the sending is left", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  await request(carol, "POST", `/exchanges/${asked.id}/receive`, undefined, inNovember);

  await sweep(justAfter);

  expect(await pointsOf(me)).toBe(50);
});

it("a refunded exchange is money given back: earns on what is left, here nothing", async () => {
  const me = someone();
  const book = await bookWith(5000, 5);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  await setStock(book, 0);
  await request(carol, "POST", `/exchanges/${asked.id}/receive`, undefined, inNovember);

  await sweep(justAfter);

  expect(await pointsOf(me)).toBe(0);
  expect(await windowOf(order.id)).toMatchObject({
    pointsClosedAt: expect.any(Date),
    pointsEarnedAt: expect.any(Date),
  });
});

it("once the points are closed the window has moved on, and no request is taken after the period", async () => {
  const me = someone();
  await put(me, await bookWith(5000, 5), 1);
  const order = await shippedOrder(me);
  // The close ran first and moved the window; a request that read the window before it would carry the old version
  await sweep(justAfter);
  const closed = await windowOf(order.id);
  // Opened at the ship (1), moved by the close (2)
  expect(closed).toMatchObject({ version: 2, pointsClosedAt: expect.any(Date) });

  // After the period no request is taken at all
  const late = await request(
    me,
    "POST",
    `/orders/${order.id}/exchanges`,
    { reason: "damaged", lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] },
    justAfter,
  );
  expect(late.status).toBe(422);
});
