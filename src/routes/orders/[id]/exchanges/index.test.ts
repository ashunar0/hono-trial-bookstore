import { expect, it } from "vitest";
import { alice, carol, request, someone } from "../../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  put,
  shippedOrder,
  stockOf,
  type Order,
} from "../../../../../test/helpers";

type Exchange = {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  lines: { orderLineId: string; quantity: number }[];
};

const ask = (
  who: Parameters<typeof request>[0],
  order: Order,
  lines: { orderLineId: string; quantity: number }[],
  reason = "damaged",
  at = inNovember,
) => request(who, "POST", `/orders/${order.id}/exchanges`, { reason, lines }, at);

const askReturn = (
  who: Parameters<typeof request>[0],
  order: Order,
  lines: { orderLineId: string; quantity: number }[],
) => request(who, "POST", `/orders/${order.id}/returns`, { lines }, inNovember);

const orderOf = async (who: Parameters<typeof request>[0], id: string) =>
  (await (await request(who, "GET", `/orders/${id}`)).json()) as Order & {
    exchanges: Exchange[];
    returns: { id: string }[];
  };

it("asks for a swap: requested, shown in the order, and no money or stock moves", async () => {
  const me = someone();
  const book = await bookWith(1500, 5);
  await put(me, book, 2);
  const order = await shippedOrder(me);
  const line = order.lines[0]!;
  const stock = await stockOf(book);

  const res = await ask(me, order, [{ orderLineId: line.id, quantity: 1 }], "defective");

  expect(res.status).toBe(200);
  const exchange = (await res.json()) as Exchange;
  expect(exchange).toMatchObject({
    orderId: order.id,
    reason: "defective",
    status: "requested",
    lines: [{ orderLineId: line.id, quantity: 1 }],
  });
  const after = await orderOf(me, order.id);
  expect(after.exchanges).toEqual([expect.objectContaining({ id: exchange.id })]);
  expect(after.refunds).toEqual([]);
  expect(await stockOf(book)).toBe(stock);
});

it("returns and exchanges count against the same copies; a rejected return frees its copies", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 2);
  const order = await shippedOrder(me);
  const line = order.lines[0]!;
  const one = [{ orderLineId: line.id, quantity: 1 }];

  expect((await ask(me, order, one)).status).toBe(200);
  expect((await askReturn(me, order, one)).status).toBe(200);
  // 2 copies, 1 in an exchange and 1 in a return
  const tooMany = await ask(me, order, one);
  expect(tooMany.status).toBe(409);
  expect(await tooMany.json()).toMatchObject({
    error: {
      code: "RETURN_QUANTITY_EXCEEDED",
      details: { lines: [{ orderLineId: line.id, returnable: 0 }] },
    },
  });
  expect((await askReturn(me, order, one)).status).toBe(409);

  const { returns } = await orderOf(me, order.id);
  await request(carol, "POST", `/returns/${returns[0]!.id}/reject`, { reason: "届かなかった" });
  expect((await ask(me, order, one)).status).toBe(200);
});

it("answers 422 RETURN_PERIOD_ENDED after 14 days, and 409 for an order not shipped", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const lines = [{ orderLineId: order.lines[0]!.id, quantity: 1 }];

  const late = await ask(me, order, lines, "damaged", new Date("2026-11-29T10:00:01+09:00"));
  expect(late.status).toBe(422);
  expect(await late.json()).toMatchObject({ error: { code: "RETURN_PERIOD_ENDED" } });
  expect(
    (await ask(me, order, lines, "damaged", new Date("2026-11-29T10:00:00+09:00"))).status,
  ).toBe(200);

  await put(me, await bookWith(1000, 5), 1);
  const placed = (await (await request(me, "POST", "/orders", {}, inNovember)).json()) as Order;
  const unshipped = await ask(me, placed, [{ orderLineId: placed.lines[0]!.id, quantity: 1 }]);
  expect(await unshipped.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "awaiting_payment" } },
  });
});

it("404 for someone else's order or a line not in it, 400 for a bad body, 403 for staff, 401 signed out", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const line = { orderLineId: order.lines[0]!.id, quantity: 1 };

  expect((await ask(alice, order, [line])).status).toBe(404);
  expect((await ask(me, order, [{ orderLineId: "nothing", quantity: 1 }])).status).toBe(404);
  expect((await ask(me, order, [line, line])).status).toBe(400);
  expect((await ask(me, order, [line], "boring")).status).toBe(400);
  expect((await ask(me, order, [])).status).toBe(400);
  expect((await ask(carol, order, [line])).status).toBe(403);
  expect((await ask(null, order, [line])).status).toBe(401);
});

it("a return and an exchange asked at once for the last copy: one wins, the other is a 409", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const one = [{ orderLineId: order.lines[0]!.id, quantity: 1 }];

  const results = await Promise.all([ask(me, order, one), askReturn(me, order, one)]);

  expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([200, 409]);
  const after = await orderOf(me, order.id);
  expect(after.exchanges.length + after.returns.length).toBe(1);
});

it("lists a customer's own exchanges, newest first, and all of them for staff", async () => {
  const me = someone();
  const other = someone();
  await put(me, await bookWith(1000, 5), 2);
  await put(other, await bookWith(1000, 5), 1);
  const mine = await shippedOrder(me);
  const theirs = await shippedOrder(other);
  const first = (await (
    await ask(me, mine, [{ orderLineId: mine.lines[0]!.id, quantity: 1 }])
  ).json()) as Exchange;
  const second = (await (
    await ask(
      me,
      mine,
      [{ orderLineId: mine.lines[0]!.id, quantity: 1 }],
      "defective",
      new Date(inNovember.getTime() + 1000),
    )
  ).json()) as Exchange;
  const others = (await (
    await ask(other, theirs, [{ orderLineId: theirs.lines[0]!.id, quantity: 1 }])
  ).json()) as Exchange;

  const own = (await (await request(me, "GET", "/exchanges")).json()) as { items: Exchange[] };
  expect(own.items.map((e) => e.id)).toEqual([second.id, first.id]);

  const all = (await (
    await request(carol, "GET", "/exchanges?status=requested&limit=100")
  ).json()) as {
    items: Exchange[];
  };
  expect(all.items.map((e) => e.id)).toEqual(
    expect.arrayContaining([first.id, second.id, others.id]),
  );
  expect((await request(null, "GET", "/exchanges")).status).toBe(401);
});
