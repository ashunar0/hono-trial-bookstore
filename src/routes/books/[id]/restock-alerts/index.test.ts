import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { restockAlertsTable } from "#/db/schema";
import { carol, db, request, someone } from "../../../../../test/fixtures";
import { bookWith, put } from "../../../orders/_test-helpers";

type Alert = {
  id: string;
  bookId: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
};

const at = new Date("2026-11-15T10:00:00+09:00");
const path = (book: string) => `/books/${book}/restock-alerts`;

it("POST registers an alert on a book with no stock", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);

  const res = await request(me, "POST", path(book), undefined, at);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    id: expect.any(String),
    bookId: book,
    status: "waiting",
    createdAt: at.toISOString(),
    sentAt: null,
  });
});

it("POST is 409 STOCK_AVAILABLE for a book in stock, 404 for no book", async () => {
  const me = someone();

  const inStock = await request(me, "POST", path(await bookWith(1000, 2)));
  expect(inStock.status).toBe(409);
  expect(await inStock.json()).toMatchObject({ error: { code: "STOCK_AVAILABLE" } });
  expect((await request(me, "POST", path("no-such-book"))).status).toBe(404);
});

it("POST a second time is 200 with the same alert", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);

  const first = (await (await request(me, "POST", path(book))).json()) as Alert;
  const second = await request(me, "POST", path(book));

  expect(second.status).toBe(200);
  expect(((await second.json()) as Alert).id).toBe(first.id);
});

it("DELETE cancels a waiting alert; asking after that makes a new one", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const first = (await (await request(me, "POST", path(book))).json()) as Alert;

  const res = await request(me, "DELETE", path(book));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect((await request(me, "DELETE", path(book))).status).toBe(404);
  const again = (await (await request(me, "POST", path(book))).json()) as Alert;
  expect(again.id).not.toBe(first.id);
});

it("DELETE is 409 RESTOCK_ALERT_STATUS_CONFLICT with the status once it is sending", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const alert = (await (await request(me, "POST", path(book))).json()) as Alert;
  await db()
    .update(restockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(restockAlertsTable.id, alert.id));

  const res = await request(me, "DELETE", path(book));

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({
    error: { code: "RESTOCK_ALERT_STATUS_CONFLICT", details: { status: "sending" } },
  });
});

it("someone else's alert is not seen or cancelled: DELETE is 404", async () => {
  const book = await bookWith(1000, 0);
  await request(someone(), "POST", path(book));

  expect((await request(someone(), "DELETE", path(book))).status).toBe(404);
});

it("is for customers: staff are 403 and signed out is 401", async () => {
  const book = await bookWith(1000, 0);

  expect((await request(carol, "POST", path(book))).status).toBe(403);
  expect((await request(carol, "DELETE", path(book))).status).toBe(403);
  expect((await request(null, "POST", path(book))).status).toBe(401);
  expect((await request(null, "DELETE", path(book))).status).toBe(401);
});

it("a book bought out can be asked after: the stock is read when asking", async () => {
  const me = someone();
  const buyer = someone();
  const book = await bookWith(1000, 1);
  expect((await request(me, "POST", path(book))).status).toBe(409);

  await put(buyer, book, 1);
  await request(buyer, "POST", "/orders", {}, at);

  expect((await request(me, "POST", path(book))).status).toBe(200);
});
