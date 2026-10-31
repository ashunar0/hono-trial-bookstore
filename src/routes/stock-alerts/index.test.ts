import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { stockAlertsTable } from "#/db/schema";
import { carol, db, request, someone } from "../../../test/fixtures";
import { bookWith } from "../orders/_test-helpers";

type Alert = {
  id: string;
  bookId: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
};

const at = (hour: number) => new Date(Date.UTC(2026, 10, 15, hour));

const ask = async (who: ReturnType<typeof someone>, book: string, when: Date) =>
  (await (
    await request(who, "POST", `/books/${book}/stock-alerts`, undefined, when)
  ).json()) as Alert;

it("GET /stock-alerts: my alerts of every status, newest first, in pages", async () => {
  const me = someone();
  const [a, b, c] = [await bookWith(1000, 0), await bookWith(1100, 0), await bookWith(1200, 0)];
  const first = await ask(me, a, at(1));
  const second = await ask(me, b, at(2));
  const third = await ask(me, c, at(3));
  await db()
    .update(stockAlertsTable)
    .set({ status: "sent", attempts: 1, sentAt: at(5) })
    .where(eq(stockAlertsTable.id, second.id));
  await db()
    .update(stockAlertsTable)
    .set({ status: "failed", attempts: 3 })
    .where(eq(stockAlertsTable.id, third.id));
  await ask(someone(), a, at(4));

  const res = await request(me, "GET", "/stock-alerts?limit=2");

  const page = (await res.json()) as { items: Alert[]; nextCursor: string | null };
  expect(page.items).toEqual([
    { id: third.id, bookId: c, status: "failed", createdAt: at(3).toISOString(), sentAt: null },
    {
      id: second.id,
      bookId: b,
      status: "sent",
      createdAt: at(2).toISOString(),
      sentAt: at(5).toISOString(),
    },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const next = (await (
    await request(me, "GET", `/stock-alerts?limit=2&cursor=${page.nextCursor}`)
  ).json()) as { items: Alert[] };
  expect(next.items).toEqual([first]);
});

it("an alert cancelled is not listed", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  await ask(me, book, at(1));
  await request(me, "DELETE", `/books/${book}/stock-alerts`);

  const page = (await (await request(me, "GET", "/stock-alerts")).json()) as { items: Alert[] };

  expect(page.items).toEqual([]);
});

it("is the customer's own: staff are 403 and signed out is 401", async () => {
  expect((await request(carol, "GET", "/stock-alerts")).status).toBe(403);
  expect((await request(null, "GET", "/stock-alerts")).status).toBe(401);
});
