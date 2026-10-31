import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { stockAlertsTable } from "#/db/schema";
import { downMailer } from "#/lib/mailer";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../../../test/fixtures";
import { bookWith } from "../../../../test/helpers";
import { pauseBefore } from "../../../../test/interleave";
import { cancelStockAlert } from "./cancelStockAlert";
import { registerStockAlert } from "./registerStockAlert";
import { sendStockAlert } from "./sendStockAlert";

const deps = makeDeps(env);
const now = new Date("2026-11-15T10:00:00+09:00");

const ask = (who: ReturnType<typeof someone>, bookId: string) =>
  registerStockAlert(deps, { customerId: userId(who.id), email: who.email, bookId, now });

const rowOf = async (id: string) => {
  const [row] = await db().select().from(stockAlertsTable).where(eq(stockAlertsTable.id, id));
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
    .from(stockAlertsTable)
    .where(eq(stockAlertsTable.customerId, me2.id));
  expect(rows).toHaveLength(1);
});

it("keeps an alert that is already sending when asked again, even with the book in stock", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const first = await ask(me, book);
  if (!first.ok) throw new Error("not registered");
  await db()
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(stockAlertsTable.id, first.value.id));

  const again = await ask(me, book);

  expect(again).toMatchObject({ ok: true, value: { id: first.value.id, status: "sending" } });
});

it("can be asked again once the alert is sent", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const first = await ask(me, book);
  if (!first.ok) throw new Error("not registered");
  await db()
    .update(stockAlertsTable)
    .set({ status: "sent", attempts: 1, sentAt: now })
    .where(eq(stockAlertsTable.id, first.value.id));

  const again = await ask(me, book);

  expect(again).toMatchObject({ ok: true, value: { status: "waiting" } });
  if (again.ok) expect(again.value.id).not.toBe(first.value.id);
});

it("cancels a waiting alert by deleting it; 404 when there is none; 409 while sending", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const created = await ask(me, book);
  if (!created.ok) throw new Error("not registered");

  expect(await cancelStockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: true,
    value: { id: created.value.id },
  });
  expect(await rowOf(created.value.id)).toBeUndefined();
  expect(await cancelStockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });

  const sending = await ask(me, book);
  if (!sending.ok) throw new Error("not registered");
  await db()
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(stockAlertsTable.id, sending.value.id));
  expect(await cancelStockAlert(deps, { customerId: userId(me.id), bookId: book })).toEqual({
    ok: false,
    error: { code: "STOCK_ALERT_STATUS_CONFLICT", details: { status: "sending" } },
  });
  expect(await rowOf(sending.value.id)).toBeDefined();
});

it("another customer's alert is not cancelled by someone else", async () => {
  const mine = someone();
  const book = await bookWith(1000, 0);
  const created = await ask(mine, book);
  if (!created.ok) throw new Error("not registered");

  const result = await cancelStockAlert(deps, { customerId: userId(someone().id), bookId: book });

  expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await rowOf(created.value.id)).toBeDefined();
});

it("a cancel that read the alert as waiting loses to the cron that starts sending it meanwhile: 409, and the alert is kept", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const asked = await ask(me, book);
  if (!asked.ok) throw new Error("not registered");
  await request(carol, "PUT", `/books/${book}/stock`, { quantity: 3, version: 1 });

  let sent: Awaited<ReturnType<typeof sendStockAlert>> | undefined;
  const DB = pauseBefore(env.DB, /^delete from "stock_alerts"/, async () => {
    sent = await sendStockAlert(makeDeps(env, { mailer: downMailer() }), {
      id: asked.value.id,
      now,
    });
  });
  const cancelled = await cancelStockAlert(makeDeps({ ...env, DB }), {
    customerId: userId(me.id),
    bookId: book,
  });

  expect(sent).toMatchObject({ ok: true, value: { outcome: "retry" } });
  expect(cancelled).toMatchObject({
    ok: false,
    error: { code: "STOCK_ALERT_STATUS_CONFLICT", details: { status: "sending" } },
  });
  expect((await rowOf(asked.value.id))?.status).toBe("sending");
});
