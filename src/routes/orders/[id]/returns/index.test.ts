import { expect, it } from "vitest";
import { alice, carol, request, someone } from "../../../../../test/fixtures";
import {
  bookWith,
  fixed500,
  inNovember,
  put,
  shippedOrder,
  stockOf,
  type Order,
} from "../../../../../test/helpers";

type Return = { id: string; status: string; lines: { orderLineId: string; quantity: number }[] };

const ask = (
  who: Parameters<typeof request>[0],
  order: Order,
  lines: { orderLineId: string; quantity: number }[],
  at = inNovember,
) => request(who, "POST", `/orders/${order.id}/returns`, { lines }, at);

const receive = (id: string) =>
  request(carol, "POST", `/returns/${id}/receive`, undefined, inNovember);

const orderOf = async (who: Parameters<typeof request>[0], id: string) =>
  (await (await request(who, "GET", `/orders/${id}`)).json()) as Order & { returns: Return[] };

it("the design's example: B comes back, 1,500 − 215 = 1,285 is refunded, and B is back in stock", async () => {
  const me = someone();
  const a = await bookWith(2000, 5);
  const b = await bookWith(1500, 5);
  await put(me, a, 1);
  await put(me, b, 1);
  const order = await shippedOrder(me, await fixed500());
  const lineB = order.lines[1]!;

  const asked = await ask(me, order, [{ orderLineId: lineB.id, quantity: 1 }]);
  const returned = (await asked.json()) as Return;
  expect(returned).toMatchObject({ status: "requested" });
  // Nothing is refunded, nothing is back, until staff receive it
  expect((await orderOf(me, order.id)).refunds).toEqual([]);
  expect(await stockOf(b)).toBe(4);

  const received = await receive(returned.id);

  expect(await received.json()).toMatchObject({ status: "completed" });
  const after = await orderOf(me, order.id);
  expect(after.refunds).toEqual([
    expect.objectContaining({ returnId: returned.id, amount: 1285, tax: 116 }),
  ]);
  expect(after.returns).toEqual([
    expect.objectContaining({ id: returned.id, status: "completed" }),
  ]);
  expect(await stockOf(b)).toBe(5);
});

it("copies of one line come back one by one: 834, 834, 832", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 3);
  const order = await shippedOrder(me, await fixed500());
  const line = order.lines[0]!;

  const amounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const asked = (await (
      await ask(me, order, [{ orderLineId: line.id, quantity: 1 }])
    ).json()) as Return;
    await receive(asked.id);
    // The refund of this return (they share a time, so the list's order does not tell)
    const { refunds } = await orderOf(me, order.id);
    amounts.push(refunds.find((r) => r.returnId === asked.id)?.amount ?? 0);
  }

  expect(amounts).toEqual([834, 834, 832]);
});

it("answers 409 RETURN_QUANTITY_EXCEEDED past the copies left; a rejected return frees its copies", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const line = order.lines[0]!;

  const tooMany = await ask(me, order, [{ orderLineId: line.id, quantity: 2 }]);
  expect(tooMany.status).toBe(409);
  expect(await tooMany.json()).toMatchObject({
    error: {
      code: "RETURN_QUANTITY_EXCEEDED",
      details: { lines: [{ orderLineId: line.id, returnable: 1 }] },
    },
  });

  const first = (await (
    await ask(me, order, [{ orderLineId: line.id, quantity: 1 }])
  ).json()) as Return;
  expect((await ask(me, order, [{ orderLineId: line.id, quantity: 1 }])).status).toBe(409);

  const rejected = await request(carol, "POST", `/returns/${first.id}/reject`, {
    reason: "届かなかった",
  });
  expect(await rejected.json()).toMatchObject({ status: "rejected", rejectReason: "届かなかった" });
  expect((await ask(me, order, [{ orderLineId: line.id, quantity: 1 }])).status).toBe(200);
});

it("answers 422 RETURN_PERIOD_ENDED after 14 days, and 409 for an order not shipped", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const lines = [{ orderLineId: order.lines[0]!.id, quantity: 1 }];

  const late = await ask(me, order, lines, new Date("2026-11-29T10:00:01+09:00"));
  expect(late.status).toBe(422);
  expect(await late.json()).toMatchObject({ error: { code: "RETURN_PERIOD_ENDED" } });
  expect((await ask(me, order, lines, new Date("2026-11-29T10:00:00+09:00"))).status).toBe(200);

  await put(me, await bookWith(1000, 5), 1);
  const placed = (await (await request(me, "POST", "/orders", {}, inNovember)).json()) as Order;
  const unshipped = await ask(me, placed, [{ orderLineId: placed.lines[0]!.id, quantity: 1 }]);
  expect(await unshipped.json()).toMatchObject({
    error: { code: "ORDER_STATUS_CONFLICT", details: { status: "awaiting_payment" } },
  });
});

it("404 for someone else's order or a line not in it, 400 for a line twice, 403 for staff", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const line = { orderLineId: order.lines[0]!.id, quantity: 1 };

  expect((await ask(alice, order, [line])).status).toBe(404);
  expect((await ask(me, order, [{ orderLineId: "nothing", quantity: 1 }])).status).toBe(404);
  expect((await ask(me, order, [line, line])).status).toBe(400);
  expect((await ask(carol, order, [line])).status).toBe(403);
});

it("a return is decided once: 409 RETURN_STATUS_CONFLICT after that", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const asked = (await (
    await ask(me, order, [{ orderLineId: order.lines[0]!.id, quantity: 1 }])
  ).json()) as Return;
  await receive(asked.id);

  const again = await receive(asked.id);
  expect(again.status).toBe(409);
  expect(await again.json()).toMatchObject({
    error: { code: "RETURN_STATUS_CONFLICT", details: { status: "completed" } },
  });
  expect(
    (await request(carol, "POST", `/returns/${asked.id}/reject`, { reason: "x" })).status,
  ).toBe(409);
});

it("staff list the returns waiting for them; a customer cannot", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const asked = (await (
    await ask(me, order, [{ orderLineId: order.lines[0]!.id, quantity: 1 }])
  ).json()) as Return;

  const res = await request(carol, "GET", "/returns?status=requested&limit=100");
  const { items } = (await res.json()) as { items: Return[] };
  expect(items.map((r) => r.id)).toContain(asked.id);
  expect((await request(me, "GET", "/returns")).status).toBe(403);
});
