import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { restockAlertsTable } from "#/db/schema";
import { makeDeps } from "#/main";
import { db, someone } from "../../../../test/fixtures";
import { bookWith } from "../../../routes/orders/_test-helpers";
import { cancelRestockAlert } from "./cancelRestockAlert";
import { registerRestockAlert } from "./registerRestockAlert";

const deps = makeDeps(env);
const now = new Date("2026-11-15T10:00:00+09:00");

const ask = (who: ReturnType<typeof someone>, bookId: string) =>
  registerRestockAlert(deps, { customerId: userId(who.id), email: who.email, bookId, now });

const rowOf = async (id: string) => {
  const [row] = await db().select().from(restockAlertsTable).where(eq(restockAlertsTable.id, id));
  return row;
};

it("registers a waiting alert on a book with no stock, keeping the address", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);

  const result = await ask(me, book);

  expect(result).toMatchObject({
    ok: true,
    value: { bookId: book, customerId: me.id, email: me.email, status: "waiting", attempts: 0 },
  });
});

it("is 404 for a book that does not exist, and 409 STOCK_AVAILABLE for one in stock", async () => {
  const me = someone();

  expect(await ask(me, "no-such-book")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await ask(me, await bookWith(1000, 1))).toEqual({ ok: false, error: "STOCK_AVAILABLE" });
});

it("asking again returns the same alert, also when two asks come at once", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);

  const first = await ask(me, book);
  const again = await ask(me, book);
  const [one, two] = await Promise.all([ask(someone(), book), ask(someone(), book)]);
  const me2 = someone();
  const [a, b] = await Promise.all([ask(me2, book), ask(me2, book)]);

  expect(again).toEqual(first);
  expect(one.ok && two.ok).toBe(true);
  expect(a.ok && b.ok && a.value.id === b.value.id).toBe(true);
  const rows = await db()
    .select()
    .from(restockAlertsTable)
    .where(eq(restockAlertsTable.customerId, me2.id));
  expect(rows).toHaveLength(1);
});

it("keeps an alert that is already sending when asked again, even with the book in stock", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const first = await ask(me, book);
  if (!first.ok) throw new Error("not registered");
  await db()
    .update(restockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(restockAlertsTable.id, first.value.id));

  const again = await ask(me, book);

  expect(again).toMatchObject({ ok: true, value: { id: first.value.id, status: "sending" } });
});

it("can be asked again once the alert is sent", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const first = await ask(me, book);
  if (!first.ok) throw new Error("not registered");
  await db()
    .update(restockAlertsTable)
    .set({ status: "sent", attempts: 1, sentAt: now })
    .where(eq(restockAlertsTable.id, first.value.id));

  const again = await ask(me, book);

  expect(again).toMatchObject({ ok: true, value: { status: "waiting" } });
  if (again.ok) expect(again.value.id).not.toBe(first.value.id);
});

it("cancels a waiting alert by deleting it; 404 when there is none; 409 while sending", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const created = await ask(me, book);
  if (!created.ok) throw new Error("not registered");

  expect(await cancelRestockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: true,
    value: { id: created.value.id },
  });
  expect(await rowOf(created.value.id)).toBeUndefined();
  expect(await cancelRestockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });

  const sending = await ask(me, book);
  if (!sending.ok) throw new Error("not registered");
  await db()
    .update(restockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(restockAlertsTable.id, sending.value.id));
  expect(await cancelRestockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: false,
    error: { code: "RESTOCK_ALERT_STATUS_CONFLICT", details: { status: "sending" } },
  });
  expect(await rowOf(sending.value.id)).toBeDefined();
});

it("another customer's alert is not cancelled by someone else", async () => {
  const mine = someone();
  const book = await bookWith(1000, 0);
  const created = await ask(mine, book);
  if (!created.ok) throw new Error("not registered");

  const result = await cancelRestockAlert(deps, { customerId: userId(someone().id), bookId: book });

  expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await rowOf(created.value.id)).toBeDefined();
});
