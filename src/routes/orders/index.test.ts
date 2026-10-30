import { expect, it } from "vitest";
import { carol, request, someone } from "../../../test/fixtures";
import { bookWith, fixed500, place, put, stockOf, type Order } from "./_test-helpers";

it("places the cart as an order: the design's fixed coupon example", async () => {
  const me = someone();
  const a = await bookWith(2000, 5);
  const b = await bookWith(1500, 5);
  await put(me, a, 1);
  await put(me, b, 1);
  const code = await fixed500();

  const res = await place(me, code);

  expect(res.status).toBe(200);
  const order = (await res.json()) as Order;
  expect(order).toMatchObject({
    status: "awaiting_payment",
    subtotal: 3500,
    discount: 500,
    shippingFee: 0,
    total: 3000,
    tax: 272,
    couponCode: code.toUpperCase(),
    paymentDueAt: "2026-11-18T01:00:00.000Z",
  });
  expect(order.lines.map((l) => [l.bookId, l.unitPrice, l.discount])).toEqual([
    [a, 2000, 285],
    [b, 1500, 215],
  ]);
  // The stock is held, and the cart is empty
  expect([await stockOf(a), await stockOf(b)]).toEqual([4, 4]);
  const cart = (await (await request(me, "GET", "/cart")).json()) as { items: unknown[] };
  expect(cart.items).toEqual([]);
});

it("answers 422 CART_EMPTY to an empty cart", async () => {
  const res = await place(someone());

  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ error: { code: "CART_EMPTY" } });
});

it("answers 422 COUPON_NOT_APPLICABLE with the reason, and writes nothing", async () => {
  const me = someone();
  const a = await bookWith(2000, 5);
  await put(me, a, 1);

  const res = await place(me, await fixed500());

  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({
    error: { code: "COUPON_NOT_APPLICABLE", details: { reason: "below_minimum" } },
  });
  expect(await stockOf(a)).toBe(5);
});

it("answers 409 OUT_OF_STOCK with the books short, and holds nothing", async () => {
  const me = someone();
  const a = await bookWith(1000, 5);
  const b = await bookWith(1000, 1);
  await put(me, a, 2);
  await put(me, b, 2);

  const res = await place(me);

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({
    error: {
      code: "OUT_OF_STOCK",
      details: { books: [{ bookId: b, requested: 2, available: 1 }] },
    },
  });
  expect([await stockOf(a), await stockOf(b)]).toEqual([5, 1]);
  const list = (await (await request(me, "GET", "/orders")).json()) as { items: unknown[] };
  expect(list.items).toEqual([]);
});

it("a book that never had stock is out of stock", async () => {
  const me = someone();
  const res0 = await request(carol, "POST", "/books", {
    title: "新刊",
    author: "著者",
    price: 900,
  });
  const { id } = (await res0.json()) as { id: string };
  await put(me, id, 1);

  const res = await place(me);

  expect(await res.json()).toMatchObject({
    error: { code: "OUT_OF_STOCK", details: { books: [{ bookId: id, available: 0 }] } },
  });
});

it("answers 409 COUPON_ALREADY_USED to a second order with the coupon, and gives its stock back", async () => {
  const me = someone();
  const a = await bookWith(3500, 5);
  const code = await fixed500();
  await put(me, a, 1);
  expect((await place(me, code)).status).toBe(200);

  await put(me, a, 1);
  const res = await place(me, code);

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: { code: "COUPON_ALREADY_USED" } });
  expect(await stockOf(a)).toBe(4);
  const list = (await (await request(me, "GET", "/orders")).json()) as { items: unknown[] };
  expect(list.items).toHaveLength(1);
});

it("a customer sees only their own orders; staff see them all", async () => {
  const me = someone();
  const other = someone();
  const a = await bookWith(1000, 5);
  await put(me, a, 1);
  const mine = (await (await place(me)).json()) as Order;

  expect((await request(me, "GET", `/orders/${mine.id}`)).status).toBe(200);
  expect((await request(other, "GET", `/orders/${mine.id}`)).status).toBe(404);
  expect((await request(carol, "GET", `/orders/${mine.id}`)).status).toBe(200);

  const theirs = (await (await request(other, "GET", "/orders")).json()) as { items: Order[] };
  expect(theirs.items).toEqual([]);
  const all = (await (await request(carol, "GET", "/orders?limit=100")).json()) as {
    items: Order[];
  };
  expect(all.items.map((o) => o.id)).toContain(mine.id);
});

it("staff cannot place an order, and signed out is 401", async () => {
  expect((await request(carol, "POST", "/orders", {})).status).toBe(403);
  expect((await request(null, "GET", "/orders")).status).toBe(401);
});
