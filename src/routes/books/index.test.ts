import { expect, it } from "vitest";
import { alice, carol, request } from "../../../test/fixtures";

const book = { title: "吾輩は猫である", author: "夏目漱石", price: 770 };

const register = async (input: unknown = book, at?: Date) => {
  const res = await request(carol, "POST", "/books", input, at);
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; title: string; price: number };
};

it("staff registers a book, and anyone reads it, signed out too", async () => {
  const created = await register();

  const res = await request(null, "GET", `/books/${created.id}`);

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: created.id, ...book });
});

it("lists newest first, a page at a time", async () => {
  // Later than the books the other tests register now, so these two are the newest
  const first = await register({ ...book, title: "first" }, new Date("2099-01-01T00:00:00Z"));
  const second = await register({ ...book, title: "second" }, new Date("2099-01-02T00:00:00Z"));

  const page1 = await request(null, "GET", "/books?limit=1");
  const body1 = (await page1.json()) as { items: { id: string }[]; nextCursor: string | null };
  expect(body1.items.map((b) => b.id)).toEqual([second.id]);
  if (body1.nextCursor === null) throw new Error("no next page");

  const page2 = await request(null, "GET", `/books?limit=1&cursor=${body1.nextCursor}`);
  const body2 = (await page2.json()) as { items: { id: string }[] };
  expect(body2.items.map((b) => b.id)).toEqual([first.id]);
});

it("staff edits the title, author and price", async () => {
  const created = await register();

  const res = await request(carol, "PUT", `/books/${created.id}`, {
    title: "坊っちゃん",
    author: "夏目漱石",
    price: 495,
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: created.id, title: "坊っちゃん", price: 495 });
});

it("answers 404 for a book that does not exist", async () => {
  expect((await request(null, "GET", "/books/nothing")).status).toBe(404);
  expect((await request(carol, "PUT", "/books/nothing", book)).status).toBe(404);
});

it("answers 400 to a price of 0", async () => {
  const res = await request(carol, "POST", "/books", { ...book, price: 0 });

  expect(res.status).toBe(400);
});

it("answers 403 to a customer and 401 when signed out", async () => {
  const created = await register();

  expect((await request(alice, "POST", "/books", book)).status).toBe(403);
  expect((await request(alice, "PUT", `/books/${created.id}`, book)).status).toBe(403);
  expect((await request(null, "POST", "/books", book)).status).toBe(401);
});
