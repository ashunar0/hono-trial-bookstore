import { expect, it } from "vitest";
import { alice, carol, request } from "../../../../../test/fixtures";

type Book = { id: string; stock: { quantity: number; version: number } };

const register = async () => {
  const res = await request(carol, "POST", "/books", {
    title: "こころ",
    author: "夏目漱石",
    price: 539,
  });
  return (await res.json()) as Book;
};

const read = async (id: string) =>
  (await (await request(null, "GET", `/books/${id}`)).json()) as Book;

const setStock = (id: string, body: { quantity: number; version: number }) =>
  request(carol, "PUT", `/books/${id}/stock`, body);

it("a new book has no stock, version 0", async () => {
  const book = await register();

  expect(book.stock).toEqual({ quantity: 0, version: 0 });
  expect((await read(book.id)).stock).toEqual({ quantity: 0, version: 0 });
});

it("staff set it from version 0, then from the version they read", async () => {
  const book = await register();

  const first = await setStock(book.id, { quantity: 5, version: 0 });
  expect(await first.json()).toEqual({ quantity: 5, version: 1 });

  const second = await setStock(book.id, { quantity: 3, version: 1 });
  expect(await second.json()).toEqual({ quantity: 3, version: 2 });

  expect((await read(book.id)).stock).toEqual({ quantity: 3, version: 2 });
});

it("the list shows each book's stock", async () => {
  const book = await register();
  await setStock(book.id, { quantity: 7, version: 0 });

  const res = await request(null, "GET", "/books?limit=100");
  const { items } = (await res.json()) as { items: Book[] };

  expect(items.find((b) => b.id === book.id)?.stock).toEqual({ quantity: 7, version: 1 });
});

it("answers 409 STOCK_CHANGED to a version no longer current, and leaves the stock", async () => {
  const book = await register();
  await setStock(book.id, { quantity: 5, version: 0 });

  const stale = await setStock(book.id, { quantity: 9, version: 0 });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: { code: "STOCK_CHANGED" } });

  const old = await setStock(book.id, { quantity: 9, version: 7 });
  expect(old.status).toBe(409);

  expect((await read(book.id)).stock).toEqual({ quantity: 5, version: 1 });
});

it("answers 404 for a book that does not exist", async () => {
  const res = await setStock("nothing", { quantity: 1, version: 0 });

  expect(res.status).toBe(404);
});

it("answers 400 to a negative count", async () => {
  const book = await register();

  const res = await setStock(book.id, { quantity: -1, version: 0 });

  expect(res.status).toBe(400);
});

it("answers 403 to a customer and 401 when signed out", async () => {
  const book = await register();
  const body = { quantity: 1, version: 0 };

  expect((await request(alice, "PUT", `/books/${book.id}/stock`, body)).status).toBe(403);
  expect((await request(null, "PUT", `/books/${book.id}/stock`, body)).status).toBe(401);
});
