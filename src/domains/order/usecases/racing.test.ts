import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { ordersTable, refundsTable, returnsTable } from "#/db/schema";
import { cancelOrder, receiveReturn, requestReturn } from "#/domains/order/index";
import { makeDeps } from "#/main";
import { env } from "cloudflare:workers";
import { db, request, someone } from "../../../../test/fixtures";
import {
  bookWith,
  inNovember,
  placedOrder,
  put,
  shippedOrder,
} from "../../../routes/orders/_test-helpers";

const refundsOf = (orderId: string) =>
  db().select().from(refundsTable).where(eq(refundsTable.orderId, orderId));

it("two cancels of one paid order at once: one wins, and the money goes back once", async () => {
  const me = someone();
  const order = await placedOrder(me, await bookWith(1000, 5));
  await request(me, "POST", `/orders/${order.id}/pay`, undefined, inNovember);
  const [paid] = await db().select().from(ordersTable).where(eq(ordersTable.id, order.id));
  const at = { id: order.id, version: paid!.version, now: inNovember };

  const results = await Promise.all([
    cancelOrder(makeDeps(env), { ...at, by: { customerId: userId(me.id) } }),
    cancelOrder(makeDeps(env), { ...at, by: "staff" }),
  ]);

  expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
  expect(await refundsOf(order.id)).toHaveLength(1);
});

it("two receives of one return at once: one wins, the other is a 409, and the money goes back once", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const asked = (await (
    await request(
      me,
      "POST",
      `/orders/${order.id}/returns`,
      { lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] },
      inNovember,
    )
  ).json()) as { id: string };

  const results = await Promise.all([
    receiveReturn(makeDeps(env), { returnId: asked.id, by: "staff", now: inNovember }),
    receiveReturn(makeDeps(env), { returnId: asked.id, by: "staff", now: inNovember }),
  ]);

  expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
  expect(await refundsOf(order.id)).toHaveLength(1);
});

it("two requests for the same copies at once: the one that loses writes nothing, even if it stops right after", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  // Anything the loser would delete to take itself back fails: as if the Worker died there
  const real = makeDeps(env);
  const db = new Proxy(real.db, {
    get(target, key) {
      if (key === "delete")
        return () => {
          throw new Error("died");
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const ask = () =>
    requestReturn(
      { ...real, db },
      {
        customerId: userId(me.id),
        orderId: order.id,
        lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }],
        now: inNovember,
      },
    ).catch((error: Error) => error.message);

  const results = await Promise.all([ask(), ask()]);

  expect(results.some((r) => typeof r === "object" && r.ok)).toBe(true);
  const returns = await db.select().from(returnsTable).where(eq(returnsTable.orderId, order.id));
  expect(returns).toHaveLength(1);
});
