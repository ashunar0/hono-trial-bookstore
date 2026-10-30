import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { makeDeps } from "#/main";
import { carol, request } from "../../../../test/fixtures";
import { stocksOf } from "../queries";
import { releaseReservation } from "./releaseReservation";
import { reserveStock } from "./reserveStock";

const now = new Date("2026-11-15T00:00:00Z");

const bookWith = async (stock: number) => {
  const res = await request(carol, "POST", "/books", { title: "本", author: "著者", price: 1000 });
  const { id } = (await res.json()) as { id: string };
  await request(carol, "PUT", `/books/${id}/stock`, { quantity: stock, version: 0 });
  return id;
};

const quantityOf = async (bookId: string) =>
  (await stocksOf(makeDeps(env).db, [bookId])).get(bookId)?.quantity;

it("holding twice with the same id holds once", async () => {
  const deps = makeDeps(env);
  const book = await bookWith(5);
  const hold = { reservationId: crypto.randomUUID(), lines: [{ bookId: book, quantity: 2 }], now };

  expect((await reserveStock(deps, hold)).ok).toBe(true);
  expect((await reserveStock(deps, hold)).ok).toBe(true);

  expect(await quantityOf(book)).toBe(3);
});

it("giving back twice gives back once", async () => {
  const deps = makeDeps(env);
  const book = await bookWith(5);
  const reservationId = crypto.randomUUID();
  await reserveStock(deps, { reservationId, lines: [{ bookId: book, quantity: 2 }], now });

  await releaseReservation(deps, { reservationId, now });
  await releaseReservation(deps, { reservationId, now });

  expect(await quantityOf(book)).toBe(5);
});

it("giving back a hold never made changes nothing (the placing stopped before it)", async () => {
  const deps = makeDeps(env);
  const book = await bookWith(5);

  await releaseReservation(deps, { reservationId: crypto.randomUUID(), now });

  expect(await quantityOf(book)).toBe(5);
});
