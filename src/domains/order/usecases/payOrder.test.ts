import { env } from "cloudflare:workers";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { makeDeps } from "#/main";
import { someone } from "../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  place,
  put,
  withPoints,
  type Order,
} from "../../../routes/orders/_test-helpers";
import { payOrder } from "./payOrder";

const payWith = async (points: number | undefined) => {
  const me = someone();
  await put(me, await bookWith(3200, 5), 1);
  await withPoints(me, 1000);
  const order = (await (await place(me, undefined, points)).json()) as Order;
  return payOrder(makeDeps(env), { customerId: userId(me.id), id: order.id, now: inNovember });
};

it("asks the payment for the total less the points: 2,700 of 3,200 with 500 points", async () => {
  const paid = await payWith(500);

  expect(paid).toMatchObject({ ok: true, value: { charged: 2700, order: { total: 3200 } } });
});

it("asks the whole total when no points were used", async () => {
  const paid = await payWith(undefined);

  expect(paid).toMatchObject({ ok: true, value: { charged: 3200 } });
});

it("an order the points paid whole is already paid: paying is a conflict", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  await withPoints(me, 1550);
  const order = (await (await place(me, undefined, 1550)).json()) as Order;

  const paid = await payOrder(makeDeps(env), {
    customerId: userId(me.id),
    id: order.id,
    now: inNovember,
  });

  expect(paid).toMatchObject({ ok: false, error: { code: "ORDER_STATUS_CONFLICT" } });
});
