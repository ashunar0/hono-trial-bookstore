import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { refundsTable } from "#/db/schema";
import { reserveStock } from "#/domains/inventory/index";
import { reservationIdOfExchange } from "#/domains/return/rules";
import { makeDeps } from "#/main";
import { alice, carol, db, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  fixed500,
  inNovember,
  place,
  pointsOf,
  put,
  shippedOrder,
  stockOf,
  withPoints,
  type Order,
} from "../../../../test/helpers";

type Exchange = { id: string; status: string; rejectReason: string | null };

const ask = async (who: Parameters<typeof request>[0], order: Order, line = 0, quantity = 1) =>
  (await (
    await request(
      who,
      "POST",
      `/orders/${order.id}/exchanges`,
      { reason: "damaged", lines: [{ orderLineId: order.lines[line]!.id, quantity }] },
      inNovember,
    )
  ).json()) as Exchange;

const act = (who: Parameters<typeof request>[0], id: string, action: string, body?: unknown) =>
  request(who, "POST", `/exchanges/${id}/${action}`, body, inNovember);

/** Staff set the stock of the book to this */
const setStock = async (bookId: string, quantity: number) => {
  const book = (await (await request(null, "GET", `/books/${bookId}`)).json()) as {
    stock: { version: number };
  };
  await request(carol, "PUT", `/books/${bookId}/stock`, { quantity, version: book.stock.version });
};

const orderOf = async (who: Parameters<typeof request>[0], id: string) =>
  (await (await request(who, "GET", `/orders/${id}`)).json()) as Order & {
    exchanges: Exchange[];
    refunds: {
      exchangeId: string | null;
      returnId: string | null;
      amount: number;
      points: number;
      tax: number;
    }[];
  };

it("with a copy on the shelf: received holds it for the swap, shipped sends it, and the damaged copy is not put back", async () => {
  const me = someone();
  const book = await bookWith(1500, 5);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  expect(await stockOf(book)).toBe(4);

  const received = await act(carol, asked.id, "receive");

  expect(received.status).toBe(200);
  expect(await received.json()).toMatchObject({
    status: "received",
    receivedAt: expect.any(String),
  });
  // The copy to send is held; the damaged one did not come back to the shelf
  expect(await stockOf(book)).toBe(3);
  expect((await orderOf(me, order.id)).refunds).toEqual([]);

  const shipped = await act(carol, asked.id, "ship");

  expect(await shipped.json()).toMatchObject({ status: "shipped", shippedAt: expect.any(String) });
  expect(await stockOf(book)).toBe(3);
});

it("with no copy left: the money goes back as for a return, with the exchange's id, and the shelf stays empty (the design's example: 1,500 − 215)", async () => {
  const me = someone();
  const a = await bookWith(2000, 5);
  const b = await bookWith(1500, 5);
  await put(me, a, 1);
  await put(me, b, 1);
  const order = await shippedOrder(me, await fixed500());
  const asked = await ask(me, order, 1);
  await setStock(b, 0);

  const received = await act(carol, asked.id, "receive");

  expect(await received.json()).toMatchObject({
    status: "refunded",
    receivedAt: expect.any(String),
  });
  expect((await orderOf(me, order.id)).refunds).toEqual([
    expect.objectContaining({
      exchangeId: asked.id,
      returnId: null,
      amount: 1285,
      tax: 116,
      points: 0,
    }),
  ]);
  expect(await stockOf(b)).toBe(0);
  // It counts against the copies like a return
  expect(
    (
      await request(
        me,
        "POST",
        `/orders/${order.id}/returns`,
        { lines: [{ orderLineId: order.lines[1]!.id, quantity: 1 }] },
        inNovember,
      )
    ).status,
  ).toBe(409);
});

it("a refunded exchange gives the points of those books back as points, like a return", async () => {
  const me = someone();
  const book = await bookWith(1600, 5);
  await put(me, book, 2);
  await withPoints(me, 500);
  const placed = (await (await place(me, undefined, 500)).json()) as Order;
  await request(me, "POST", `/orders/${placed.id}/pay`, undefined, inNovember);
  const order = (await (
    await request(carol, "POST", `/orders/${placed.id}/ship`, undefined, inNovember)
  ).json()) as Order;
  expect(await pointsOf(me)).toBe(0);
  const asked = await ask(me, order);
  await setStock(book, 0);

  await act(carol, asked.id, "receive");

  expect(await pointsOf(me)).toBe(250);
  const [refund] = await db()
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.exchangeId, asked.id));
  expect(refund).toMatchObject({ amount: 1600, pointsAmount: 250 });
});

it("each step is asked of the right state: 409 EXCHANGE_STATUS_CONFLICT with the state it is in", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);

  const early = await act(carol, asked.id, "ship");
  expect(early.status).toBe(409);
  expect(await early.json()).toMatchObject({
    error: { code: "EXCHANGE_STATUS_CONFLICT", details: { status: "requested" } },
  });

  await act(carol, asked.id, "receive");
  for (const action of ["receive", "reject"]) {
    const res = await act(carol, asked.id, action, { reason: "x" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "EXCHANGE_STATUS_CONFLICT", details: { status: "received" } },
    });
  }
  await act(carol, asked.id, "ship");
  const again = await act(carol, asked.id, "ship");
  expect(await again.json()).toMatchObject({
    error: { code: "EXCHANGE_STATUS_CONFLICT", details: { status: "shipped" } },
  });
});

it("a rejected exchange keeps its reason and frees its copies; a hold left by a receive that stopped goes back", async () => {
  const me = someone();
  const book = await bookWith(1000, 5);
  await put(me, book, 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);
  // A receive held the copy and died before it switched
  await reserveStock(makeDeps(env), {
    reservationId: reservationIdOfExchange(asked.id),
    lines: [{ bookId: book, quantity: 1 }],
    now: inNovember,
  });
  expect(await stockOf(book)).toBe(3);

  const rejected = await act(carol, asked.id, "reject", { reason: "傷んでいなかった" });

  expect(await rejected.json()).toMatchObject({
    status: "rejected",
    rejectReason: "傷んでいなかった",
    rejectedAt: expect.any(String),
  });
  expect(await stockOf(book)).toBe(4);
  expect((await orderOf(me, order.id)).exchanges).toEqual([
    expect.objectContaining({ id: asked.id, status: "rejected" }),
  ]);
  // The copy is free to ask again
  const again = await request(
    me,
    "POST",
    `/orders/${order.id}/exchanges`,
    { reason: "damaged", lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] },
    inNovember,
  );
  expect(again.status).toBe(200);
});

it("404 for an exchange that is not there, 400 without a reason, 403 for a customer, 401 signed out", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const asked = await ask(me, order);

  expect((await act(carol, "nothing", "receive")).status).toBe(404);
  expect((await act(carol, "nothing", "reject", { reason: "x" })).status).toBe(404);
  expect((await act(carol, "nothing", "ship")).status).toBe(404);
  expect((await act(carol, asked.id, "reject", {})).status).toBe(400);
  for (const action of ["receive", "reject", "ship"]) {
    expect((await act(alice, asked.id, action, { reason: "x" })).status).toBe(403);
    expect((await act(null, asked.id, action, { reason: "x" })).status).toBe(401);
  }
});
