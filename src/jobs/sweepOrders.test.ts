import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { ordersTable, returnsTable } from "#/db/schema";
import { reserveStock } from "#/domains/inventory/index";
import { makeDeps } from "#/main";
import { db, request, someone } from "../../test/fixtures";
import {
  bookWith,
  fixed500,
  inNovember,
  placedOrder,
  put,
  place,
  shippedOrder,
  stockOf,
  type Order,
} from "../routes/orders/_test-helpers";
import { sweepOrders } from "./sweepOrders";

const sweep = (now: Date) => sweepOrders({ deps: makeDeps(env), now });

const statusOf = async (id: string) => {
  const [row] = await db().select().from(ordersTable).where(eq(ordersTable.id, id));
  return row;
};

it("cancels an order past its payment deadline, and gives back its stock and coupon", async () => {
  const me = someone();
  const book = await bookWith(3500, 5);
  const code = await fixed500();
  const order = await placedOrder(me, book, code);

  await sweep(new Date("2026-11-18T09:59:59+09:00"));
  expect((await statusOf(order.id))?.status).toBe("awaiting_payment");

  await sweep(new Date("2026-11-18T10:00:00+09:00"));
  expect(await statusOf(order.id)).toMatchObject({
    status: "cancelled",
    releasedAt: expect.any(Date),
  });
  expect(await stockOf(book)).toBe(5);
  await put(me, book, 1);
  expect((await place(me, code)).status).toBe(200);
});

it("leaves a paid order alone", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));
  await request(me, "POST", `/orders/${order.id}/pay`, undefined, inNovember);

  await sweep(new Date("2026-11-20T00:00:00+09:00"));

  expect((await statusOf(order.id))?.status).toBe("paid");
});

it("cancels an order left placing for 10 minutes (the Worker died after holding the stock)", async () => {
  const book = await bookWith(1000, 5);
  const placedAt = new Date("2026-11-15T10:00:00+09:00");
  const reservationId = crypto.randomUUID();
  const id = crypto.randomUUID();
  await db()
    .insert(ordersTable)
    .values({
      id,
      customerId: someone().id,
      status: "placing",
      subtotal: 1000,
      discount: 0,
      shippingFee: 550,
      total: 1550,
      tax: 140,
      reservationId,
      paymentDueAt: new Date("2026-11-18T10:00:00+09:00"),
      version: 1,
      createdAt: placedAt,
      updatedAt: placedAt,
    });
  await reserveStock(makeDeps(env), {
    reservationId,
    lines: [{ bookId: book, quantity: 1 }],
    now: placedAt,
  });

  await sweep(new Date("2026-11-15T10:09:59+09:00"));
  expect((await statusOf(id))?.status).toBe("placing");

  await sweep(new Date("2026-11-15T10:10:00+09:00"));
  expect((await statusOf(id))?.status).toBe("cancelled");
  expect(await stockOf(book)).toBe(5);
});

it("finishes a cancel that stopped after switching to cancelled", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  const order: Order = await placedOrder(me, book);
  // Switched, then the Worker died before giving anything back
  await db()
    .update(ordersTable)
    .set({ status: "cancelled", cancelledAt: inNovember })
    .where(eq(ordersTable.id, order.id));
  expect(await stockOf(book)).toBe(4);

  await sweep(new Date("2026-11-15T11:00:00+09:00"));

  expect(await statusOf(order.id)).toMatchObject({ releasedAt: expect.any(Date) });
  expect(await stockOf(book)).toBe(5);
});

it("puts back the stock of a return completed when the Worker died before restocking", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = (await (
    await request(
      me,
      "POST",
      `/orders/${order.id}/returns`,
      {
        lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }],
      },
      inNovember,
    )
  ).json()) as { id: string };
  // Completed, then nothing more
  await db()
    .update(returnsTable)
    .set({ status: "completed", completedAt: inNovember })
    .where(eq(returnsTable.id, asked.id));
  expect(await stockOf(book)).toBe(4);

  await sweep(new Date("2026-11-15T11:00:00+09:00"));
  await sweep(new Date("2026-11-15T11:15:00+09:00"));

  expect(await stockOf(book)).toBe(5);
  const [row] = await db().select().from(returnsTable).where(eq(returnsTable.id, asked.id));
  expect(row?.stockReturnedAt).toEqual(expect.any(Date));
});
