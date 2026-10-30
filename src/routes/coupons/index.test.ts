import { expect, it } from "vitest";
import { alice, carol, request } from "../../../test/fixtures";

type Coupon = { id: string; code: string; stoppedAt: string | null };

/** A code no other test uses */
const newCode = () => `c${crypto.randomUUID().slice(0, 8)}`;

const fixed = (code = newCode()) => ({
  code,
  kind: "fixed",
  value: 500,
  minSubtotal: 3000,
  startsAt: "2026-11-01T00:00:00+09:00",
  endsAt: "2026-12-01T00:00:00+09:00",
});

const create = async (input: unknown) => {
  const res = await request(carol, "POST", "/coupons", input);
  expect(res.status).toBe(200);
  return (await res.json()) as Coupon;
};

it("staff make a coupon; the code is kept in capitals and the times in UTC", async () => {
  const code = newCode();

  const coupon = await create(fixed(code));

  expect(coupon).toMatchObject({
    code: code.toUpperCase(),
    kind: "fixed",
    value: 500,
    minSubtotal: 3000,
    startsAt: "2026-10-31T15:00:00.000Z",
    stoppedAt: null,
  });
});

it("a percent coupon may have no condition", async () => {
  const coupon = await create({ ...fixed(), kind: "percent", value: 10, minSubtotal: 0 });

  expect(coupon).toMatchObject({ kind: "percent", value: 10, minSubtotal: 0 });
});

it("answers 409 COUPON_CODE_TAKEN to a code another has, whatever its case", async () => {
  const code = newCode();
  await create(fixed(code.toLowerCase()));

  const res = await request(carol, "POST", "/coupons", fixed(code.toUpperCase()));

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: { code: "COUPON_CODE_TAKEN" } });
});

it("answers 400 to a coupon that breaks the rules", async () => {
  const broken = [
    { ...fixed(), value: 5000, minSubtotal: 3000 }, // fixed above its condition
    { ...fixed(), kind: "percent", value: 101 },
    { ...fixed(), endsAt: "2026-11-01T00:00:00+09:00" }, // ends when it starts
    { ...fixed(), startsAt: "2026-11-01T00:00:00" }, // no offset
  ];

  for (const input of broken) {
    expect((await request(carol, "POST", "/coupons", input)).status).toBe(400);
  }
});

it("staff stop a coupon; stopping it again changes nothing", async () => {
  const coupon = await create(fixed());

  const first = await request(
    carol,
    "POST",
    `/coupons/${coupon.id}/stop`,
    undefined,
    new Date("2026-11-10T00:00:00Z"),
  );
  expect(await first.json()).toMatchObject({ stoppedAt: "2026-11-10T00:00:00.000Z" });

  const again = await request(
    carol,
    "POST",
    `/coupons/${coupon.id}/stop`,
    undefined,
    new Date("2026-11-20T00:00:00Z"),
  );
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ stoppedAt: "2026-11-10T00:00:00.000Z" });
});

it("answers 404 when stopping a coupon that does not exist", async () => {
  expect((await request(carol, "POST", "/coupons/nothing/stop")).status).toBe(404);
});

it("lists newest first, stopped ones too", async () => {
  const older = await create(fixed());
  const newer = await create(fixed());
  await request(carol, "POST", `/coupons/${newer.id}/stop`);

  const res = await request(carol, "GET", "/coupons?limit=100");
  const { items } = (await res.json()) as { items: Coupon[] };
  const ids = items.map((c) => c.id);

  expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  expect(items.find((c) => c.id === newer.id)?.stoppedAt).not.toBeNull();
});

it("answers 403 to a customer and 401 when signed out", async () => {
  expect((await request(alice, "GET", "/coupons")).status).toBe(403);
  expect((await request(alice, "POST", "/coupons", fixed())).status).toBe(403);
  expect((await request(null, "GET", "/coupons")).status).toBe(401);
});
