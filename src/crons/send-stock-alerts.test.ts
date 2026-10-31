import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { stockAlertsTable } from "#/db/schema";
import { registerStockAlert, sendStockAlert } from "#/domains/stock-alert/index";
import { collectingMailer, downMailer, type Mail, type Mailer } from "#/lib/mailer";
import { makeDeps } from "#/main";
import { carol, db, request, someone } from "../../test/fixtures";
import { bookWith } from "../routes/orders/_test-helpers";
import { cron } from "./send-stock-alerts";

const t0 = new Date("2026-11-15T10:00:00+09:00");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

const run = (mailer: Mailer, now: Date) => cron.run({ deps: makeDeps(env, { mailer }), now });

/** Asks to be told about the book, as the API does */
const ask = async (who: ReturnType<typeof someone>, bookId: string) => {
  const result = await registerStockAlert(makeDeps(env), {
    customerId: userId(who.id),
    email: who.email,
    bookId,
    now: t0,
  });
  if (!result.ok) throw new Error("not registered");
  return result.value;
};

const setStock = async (bookId: string, quantity: number) => {
  const book = (await (await request(null, "GET", `/books/${bookId}`)).json()) as {
    stock: { version: number };
  };
  await request(carol, "PUT", `/books/${bookId}/stock`, {
    quantity,
    version: book.stock.version,
  });
};

const rowOf = async (id: string) => {
  const [row] = await db().select().from(stockAlertsTable).where(eq(stockAlertsTable.id, id));
  return row!;
};

const mailsOf = (outbox: Mail[], alertId: string) => outbox.filter((mail) => mail.key === alertId);

it("waits while the book has no stock, then sends one mail when it is back, and no more", async () => {
  const me = someone();
  const book = await bookWith(1000, 0);
  const alert = await ask(me, book);
  const outbox: Mail[] = [];

  await run(collectingMailer(outbox), minutes(15));
  expect(mailsOf(outbox, alert.id)).toHaveLength(0);
  expect(await rowOf(alert.id)).toMatchObject({ status: "waiting", attempts: 0 });

  await setStock(book, 3);
  await run(collectingMailer(outbox), minutes(30));
  expect(mailsOf(outbox, alert.id)).toEqual([
    {
      key: alert.id,
      to: me.email,
      subject: "「本1000」が入荷しました",
      body: expect.stringContaining("本1000"),
    },
  ]);
  expect(await rowOf(alert.id)).toMatchObject({
    status: "sent",
    attempts: 1,
    sentAt: minutes(30),
  });

  await run(collectingMailer(outbox), minutes(45));
  expect(mailsOf(outbox, alert.id)).toHaveLength(1);
});

it("an old alert on a book still out of stock does not hold back a newer one on a book that is back", async () => {
  const stuck = await ask(someone(), await bookWith(1000, 0));
  const backBook = await bookWith(1100, 0);
  const back = await ask(someone(), backBook);
  await setStock(backBook, 4);
  await db()
    .update(stockAlertsTable)
    .set({ createdAt: new Date(t0.getTime() + 1000) })
    .where(eq(stockAlertsTable.id, back.id));
  const outbox: Mail[] = [];

  await run(collectingMailer(outbox), minutes(15));

  expect(mailsOf(outbox, stuck.id)).toHaveLength(0);
  expect(mailsOf(outbox, back.id)).toHaveLength(1);
  expect((await rowOf(stuck.id)).status).toBe("waiting");
});

it("a waiting alert whose book ran out again before the mail is left waiting (the usecase checks too)", async () => {
  const book = await bookWith(1000, 0);
  const alert = await ask(someone(), book);
  const outbox: Mail[] = [];

  const result = await sendStockAlert(makeDeps(env, { mailer: collectingMailer(outbox) }), {
    id: alert.id,
    now: minutes(15),
  });

  expect(result).toEqual({ ok: true, value: { outcome: "waiting" } });
  expect(outbox).toHaveLength(0);
  expect(await rowOf(alert.id)).toMatchObject({ status: "waiting", attempts: 0 });
});

it("one that is already sending is sent whatever the stock is", async () => {
  const book = await bookWith(1000, 0);
  const alert = await ask(someone(), book);
  await db()
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(stockAlertsTable.id, alert.id));
  const outbox: Mail[] = [];

  await run(collectingMailer(outbox), minutes(15));

  expect(mailsOf(outbox, alert.id)).toHaveLength(1);
  expect(await rowOf(alert.id)).toMatchObject({ status: "sent", attempts: 2 });
});

it("a mailer that is down: three runs are three attempts, then it is given up, and never picked again", async () => {
  const book = await bookWith(1000, 2);
  const alert = await ask(someone(), await bookWith(1000, 0));
  await db()
    .update(stockAlertsTable)
    .set({ bookId: book })
    .where(eq(stockAlertsTable.id, alert.id));

  await run(downMailer(), minutes(15));
  expect(await rowOf(alert.id)).toMatchObject({ status: "sending", attempts: 1 });
  await run(downMailer(), minutes(30));
  expect(await rowOf(alert.id)).toMatchObject({ status: "sending", attempts: 2 });
  await run(downMailer(), minutes(45));
  expect(await rowOf(alert.id)).toMatchObject({ status: "failed", attempts: 3, sentAt: null });

  const outbox: Mail[] = [];
  await run(collectingMailer(outbox), minutes(60));
  expect(mailsOf(outbox, alert.id)).toHaveLength(0);
  expect(await rowOf(alert.id)).toMatchObject({ status: "failed", attempts: 3 });
});

it("a mail that failed once and then goes through is sent, with the same key", async () => {
  const book = await bookWith(1000, 0);
  const alert = await ask(someone(), book);
  await setStock(book, 1);

  await run(downMailer(), minutes(15));
  const outbox: Mail[] = [];
  await run(collectingMailer(outbox), minutes(30));

  expect(mailsOf(outbox, alert.id)).toHaveLength(1);
  expect(await rowOf(alert.id)).toMatchObject({ status: "sent", attempts: 2 });
});

it("a run that died after calling the mailer is sent again, and the mailer side keeps one mail", async () => {
  const book = await bookWith(1000, 3);
  const alert = await ask(someone(), await bookWith(1000, 0));
  await db()
    .update(stockAlertsTable)
    .set({ bookId: book })
    .where(eq(stockAlertsTable.id, alert.id));
  const outbox: Mail[] = [];
  // The first run: recorded sending, the mail went, then it died before closing
  await collectingMailer(outbox).send({
    key: alert.id,
    to: "x@example.com",
    subject: "s",
    body: "b",
  });
  await db()
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: 1 })
    .where(eq(stockAlertsTable.id, alert.id));

  await run(collectingMailer(outbox), minutes(15));

  expect(mailsOf(outbox, alert.id)).toHaveLength(1);
  expect(await rowOf(alert.id)).toMatchObject({ status: "sent", attempts: 2 });
});

it("an alert whose third attempt was started and never closed is given up without a fourth mail", async () => {
  const alert = await ask(someone(), await bookWith(1000, 0));
  await db()
    .update(stockAlertsTable)
    .set({ status: "sending", attempts: 3 })
    .where(eq(stockAlertsTable.id, alert.id));
  const outbox: Mail[] = [];

  await run(collectingMailer(outbox), minutes(15));

  expect(mailsOf(outbox, alert.id)).toHaveLength(0);
  expect(await rowOf(alert.id)).toMatchObject({ status: "failed", attempts: 3 });
});

it("two runs on the same alert at once make one attempt and one mail", async () => {
  const book = await bookWith(1000, 0);
  const alert = await ask(someone(), book);
  await setStock(book, 1);
  const outbox: Mail[] = [];
  const deps = makeDeps(env, { mailer: collectingMailer(outbox) });

  const results = await Promise.all([
    sendStockAlert(deps, { id: alert.id, now: minutes(15) }),
    sendStockAlert(deps, { id: alert.id, now: minutes(15) }),
  ]);

  expect(mailsOf(outbox, alert.id)).toHaveLength(1);
  expect(await rowOf(alert.id)).toMatchObject({ status: "sent", attempts: 1 });
  expect(results.map((r) => r.ok && r.value.outcome).sort()).toEqual(["sent", "skipped"]);
});

it("one alert that throws does not stop the others, and the run still fails so it is seen", async () => {
  const book = await bookWith(1000, 0);
  const bad = await ask(someone(), book);
  const good = await ask(someone(), book);
  await setStock(book, 5);
  const outbox: Mail[] = [];
  const mailer: Mailer = {
    send: (mail) => {
      if (mail.key === bad.id) throw new Error("boom");
      return collectingMailer(outbox).send(mail);
    },
  };

  await expect(run(mailer, minutes(15))).rejects.toThrow("boom");

  expect(mailsOf(outbox, good.id)).toHaveLength(1);
  expect(await rowOf(good.id)).toMatchObject({ status: "sent" });
  // Its attempt was recorded before the call, so the next run sends it again
  expect(await rowOf(bad.id)).toMatchObject({ status: "sending", attempts: 1 });
});
