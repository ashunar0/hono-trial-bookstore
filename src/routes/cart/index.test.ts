import { expect, it } from "vitest";
import { carol, request, someone } from "../../../test/fixtures";

type Cart = {
  items: { bookId: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  tax: number;
  coupon: { code: string; applied: boolean; reason: string | null } | null;
};

const registerBook = async (price: number) => {
  const res = await request(carol, "POST", "/books", { title: "本", author: "著者", price });
  return ((await res.json()) as { id: string }).id;
};

const makeCoupon = async (input: Record<string, unknown>) => {
  const code = `c${crypto.randomUUID().slice(0, 8)}`;
  await request(carol, "POST", "/coupons", {
    code,
    startsAt: "2026-11-01T00:00:00+09:00",
    endsAt: "2026-12-01T00:00:00+09:00",
    ...input,
  });
  return code;
};

const inNovember = new Date("2026-11-15T00:00:00+09:00");

it("a customer puts books in, changes how many, and takes one out", async () => {
  const me = someone();
  const a = await registerBook(2000);
  const b = await registerBook(1500);

  await request(me, "PUT", `/cart/items/${a}`, { quantity: 1 });
  const put = await request(me, "PUT", `/cart/items/${b}`, { quantity: 1 });
  expect(((await put.json()) as Cart).items.map((i) => i.bookId)).toEqual([a, b]);

  const changed = await request(me, "PUT", `/cart/items/${a}`, { quantity: 3 });
  expect(await changed.json()).toMatchObject({ subtotal: 7500, shippingFee: 0, total: 7500 });

  expect((await request(me, "DELETE", `/cart/items/${b}`)).status).toBe(200);
  const cart = (await (await request(me, "GET", "/cart")).json()) as Cart;
  expect(cart.items).toEqual([expect.objectContaining({ bookId: a, quantity: 3 })]);
});

it("the cart shows today's price of a book", async () => {
  const me = someone();
  const a = await registerBook(1000);
  await request(me, "PUT", `/cart/items/${a}`, { quantity: 1 });

  await request(carol, "PUT", `/books/${a}`, { title: "本", author: "著者", price: 1200 });

  const cart = (await (await request(me, "GET", "/cart")).json()) as Cart;
  expect(cart).toMatchObject({ subtotal: 1200, shippingFee: 550, total: 1750, tax: 159 });
});

it("?coupon= tries a coupon, whatever the case of the code", async () => {
  const me = someone();
  await request(me, "PUT", `/cart/items/${await registerBook(3500)}`, { quantity: 1 });
  const code = await makeCoupon({ kind: "fixed", value: 500, minSubtotal: 3000 });

  const res = await request(me, "GET", `/cart?coupon=${code.toLowerCase()}`, undefined, inNovember);

  expect(await res.json()).toMatchObject({
    subtotal: 3500,
    discount: 500,
    total: 3000,
    tax: 272,
    coupon: { applied: true, reason: null },
  });
});

it("a coupon that does not apply is 200 with no discount and the reason", async () => {
  const me = someone();
  await request(me, "PUT", `/cart/items/${await registerBook(2000)}`, { quantity: 1 });
  const code = await makeCoupon({ kind: "fixed", value: 500, minSubtotal: 3000 });

  const below = await request(me, "GET", `/cart?coupon=${code}`, undefined, inNovember);
  expect(below.status).toBe(200);
  expect(await below.json()).toMatchObject({
    discount: 0,
    total: 2550,
    coupon: { applied: false, reason: "below_minimum" },
  });

  const unknown = await request(me, "GET", "/cart?coupon=NOSUCH", undefined, inNovember);
  expect(await unknown.json()).toMatchObject({ coupon: { applied: false, reason: "not_found" } });
});

it("answers 404 for a book that does not exist or is not in the cart, and 400 to 0 copies", async () => {
  const me = someone();
  const a = await registerBook(1000);

  expect((await request(me, "PUT", "/cart/items/nothing", { quantity: 1 })).status).toBe(404);
  expect((await request(me, "DELETE", `/cart/items/${a}`)).status).toBe(404);
  expect((await request(me, "PUT", `/cart/items/${a}`, { quantity: 0 })).status).toBe(400);
});

it("each customer has their own cart; staff have none, and signed out is 401", async () => {
  const me = someone();
  const other = someone();
  await request(me, "PUT", `/cart/items/${await registerBook(1000)}`, { quantity: 1 });

  const theirs = (await (await request(other, "GET", "/cart")).json()) as Cart;
  expect(theirs.items).toEqual([]);

  expect((await request(carol, "GET", "/cart")).status).toBe(403);
  expect((await request(null, "GET", "/cart")).status).toBe(401);
});
