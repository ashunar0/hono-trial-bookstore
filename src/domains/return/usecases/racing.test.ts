import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { refundsTable, returnLinesTable, returnsTable, returnWindowsTable } from "#/db/schema";
import { receiveReturn, requestReturn } from "#/domains/return/index";
import { makeDeps } from "#/main";
import { insertReturnIfWon, updateWindow } from "../mutations";
import { env } from "cloudflare:workers";
import { db, request, someone } from "../../../../test/fixtures";
import { bookWith, inNovember, put, shippedOrder } from "../../../routes/orders/_test-helpers";

const refundsOf = (orderId: string) =>
  db().select().from(refundsTable).where(eq(refundsTable.orderId, orderId));

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

  expect(results.filter((r) => r.ok)).toHaveLength(1);
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

it("a request whose move of the window lost writes no return, though its rows are in the same batch as the move", async () => {
  const me = someone();
  await put(me, await bookWith(1000, 5), 1);
  const order = await shippedOrder(me);
  const [window] = await db()
    .select()
    .from(returnWindowsTable)
    .where(eq(returnWindowsTable.orderId, order.id));
  const stale = window!.version - 1;
  const row = { id: crypto.randomUUID(), orderId: order.id, requestedAt: inNovember };

  const [moved] = await db().batch([
    updateWindow(
      db(),
      { orderId: order.id, version: stale },
      { lastRequestId: row.id, updatedAt: inNovember },
    ),
    ...insertReturnIfWon(db(), row, [{ orderLineId: order.lines[0]!.id, quantity: 1 }]),
  ]);

  expect(moved).toHaveLength(0);
  expect(await db().select().from(returnsTable).where(eq(returnsTable.id, row.id))).toHaveLength(0);
  expect(
    await db().select().from(returnLinesTable).where(eq(returnLinesTable.returnId, row.id)),
  ).toHaveLength(0);
});
