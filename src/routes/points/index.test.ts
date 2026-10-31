import { env } from "cloudflare:workers";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { earnPoints, usePoints } from "#/domains/point/index";
import { makeDeps } from "#/main";
import { carol, request, someone } from "../../../test/fixtures";
import { bookWith, inNovember, place, put, withPoints, type Order } from "../orders/_test-helpers";

type Entry = { id: string; kind: string; amount: number; createdAt: string };

it("GET /points: 0 for a customer who never had any, then the balance", async () => {
  const me = someone();
  expect(await (await request(me, "GET", "/points")).json()).toEqual({ balance: 0 });

  await withPoints(me, 120);

  expect(await (await request(me, "GET", "/points")).json()).toEqual({ balance: 120 });
});

it("GET /points/entries: the customer's own statement, newest first, in pages", async () => {
  const me = someone();
  const other = someone();
  const customerId = userId(me.id);
  const deps = makeDeps(env);
  const at = (hour: number) => new Date(Date.UTC(2026, 10, 15, hour));
  await earnPoints(deps, { earnId: `${me.id}-e`, customerId, yen: 10000, now: at(1) });
  await usePoints(deps, { useId: `${me.id}-u`, customerId, points: 30, now: at(2) });
  await earnPoints(deps, { earnId: `${me.id}-e2`, customerId, yen: 500, now: at(3) });
  await withPoints(other, 999);

  const res = await request(me, "GET", "/points/entries?limit=2");

  const page = (await res.json()) as { items: Entry[]; nextCursor: string | null };
  expect(page.items).toEqual([
    { id: `${me.id}-e2`, kind: "earn", amount: 5, createdAt: at(3).toISOString() },
    { id: `${me.id}-u`, kind: "use", amount: -30, createdAt: at(2).toISOString() },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const next = (await (
    await request(me, "GET", `/points/entries?limit=2&cursor=${page.nextCursor}`)
  ).json()) as { items: Entry[] };
  expect(next.items.map((e) => e.id)).toEqual([`${me.id}-e`]);
});

it("the points are the customer's own: staff are 403 and signed out is 401", async () => {
  expect((await request(carol, "GET", "/points")).status).toBe(403);
  expect((await request(carol, "GET", "/points/entries")).status).toBe(403);
  expect((await request(null, "GET", "/points")).status).toBe(401);
  expect((await request(null, "GET", "/points/entries")).status).toBe(401);
});

it("an order shows pointsUsed, each line's points, and a refund's points", async () => {
  const me = someone();
  await put(me, await bookWith(3200, 5), 1);
  await withPoints(me, 500);
  const placed = (await (await place(me, undefined, 500)).json()) as Order;
  expect(placed).toMatchObject({ pointsUsed: 500, lines: [{ points: 500 }] });
  await request(me, "POST", `/orders/${placed.id}/pay`, undefined, inNovember);

  const cancelled = await request(
    me,
    "POST",
    `/orders/${placed.id}/cancel`,
    { version: placed.version + 1 },
    inNovember,
  );

  expect(await cancelled.json()).toMatchObject({
    status: "cancelled",
    pointsUsed: 500,
    refunds: [{ returnId: null, amount: 3200, points: 500, tax: 290 }],
  });
  const got = (await (await request(me, "GET", `/orders/${placed.id}`)).json()) as Record<
    string,
    unknown
  >;
  // What is inside stays inside
  expect(Object.keys(got)).not.toContain("pointUseId");
  expect(Object.keys(got)).not.toContain("earnId");
  expect(Object.keys(got)).not.toContain("shippingPoints");
});
