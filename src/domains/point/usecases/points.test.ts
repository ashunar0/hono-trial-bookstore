import { env } from "cloudflare:workers";
import { userId } from "hono-kit";
import { expect, it } from "vitest";
import { makeDeps } from "#/main";
import { someone } from "../../../../test/fixtures";
import { balanceOf, listEntries } from "../queries";
import { restoreIdOfReturn, restoreIdOfUse } from "../rules";
import { earnPoints } from "./earnPoints";
import { restorePoints } from "./restorePoints";
import { usePoints } from "./usePoints";

const now = new Date("2026-11-15T00:00:00Z");

/** A customer with this many points (earned on 100 yen each) */
const customerWith = async (points: number) => {
  const customerId = userId(someone().id);
  if (points > 0)
    await earnPoints(makeDeps(env), {
      earnId: crypto.randomUUID(),
      customerId,
      yen: points * 100,
      now,
    });
  return customerId;
};

const balance = (customerId: string) => balanceOf(makeDeps(env).db, customerId);

it("earns 1% dropping the fraction, and nothing under 100 yen", async () => {
  const me = await customerWith(0);

  await earnPoints(makeDeps(env), { earnId: "e1", customerId: me, yen: 1999, now });
  expect(await balance(me)).toBe(19);

  await earnPoints(makeDeps(env), { earnId: "e2", customerId: me, yen: 99, now });
  expect(await balance(me)).toBe(19);
});

it("a customer who never had points has 0", async () => {
  expect(await balance(userId(someone().id))).toBe(0);
});

it("uses points off the balance", async () => {
  const me = await customerWith(500);

  const used = await usePoints(makeDeps(env), { useId: "u-1", customerId: me, points: 200, now });

  expect(used.ok).toBe(true);
  expect(await balance(me)).toBe(300);
});

it("POINTS_INSUFFICIENT with the balance when it is not enough, and takes nothing", async () => {
  const me = await customerWith(100);

  const used = await usePoints(makeDeps(env), { useId: "u-2", customerId: me, points: 101, now });

  expect(used).toMatchObject({
    ok: false,
    error: { code: "POINTS_INSUFFICIENT", details: { balance: 100 } },
  });
  expect(await balance(me)).toBe(100);
  const entries = await listEntries(makeDeps(env).db, me, { limit: 10 });
  expect(entries.items.map((e) => e.kind)).toEqual(["earn"]);
});

it("a customer with no balance row cannot use points, and no entry is left behind", async () => {
  const me = userId(someone().id);

  const used = await usePoints(makeDeps(env), { useId: "u-3", customerId: me, points: 1, now });

  expect(used).toMatchObject({ ok: false, error: { details: { balance: 0 } } });
  expect((await listEntries(makeDeps(env).db, me, { limit: 10 })).items).toEqual([]);
});

it("using twice with the same id uses once", async () => {
  const me = await customerWith(500);
  const use = { useId: crypto.randomUUID(), customerId: me, points: 200, now };

  expect((await usePoints(makeDeps(env), use)).ok).toBe(true);
  expect((await usePoints(makeDeps(env), use)).ok).toBe(true);

  expect(await balance(me)).toBe(300);
});

it("giving back twice with the same id gives back once; 0 gives back nothing", async () => {
  const me = await customerWith(500);
  const useId = crypto.randomUUID();
  await usePoints(makeDeps(env), { useId, customerId: me, points: 200, now });
  const back = { restoreId: restoreIdOfUse(useId), customerId: me, points: 200, now };

  await restorePoints(makeDeps(env), back);
  await restorePoints(makeDeps(env), back);
  await restorePoints(makeDeps(env), { ...back, restoreId: restoreIdOfReturn("r1"), points: 0 });

  expect(await balance(me)).toBe(500);
  const entries = await listEntries(makeDeps(env).db, me, { limit: 10 });
  expect(entries.items).toHaveLength(3);
});

it("earning twice with the same id earns once", async () => {
  const me = await customerWith(0);
  const earn = { earnId: crypto.randomUUID(), customerId: me, yen: 5000, now };

  await earnPoints(makeDeps(env), earn);
  await earnPoints(makeDeps(env), earn);

  expect(await balance(me)).toBe(50);
});

it("two uses of the same points at once: one wins, the other is POINTS_INSUFFICIENT, and the balance stays at 0 or more", async () => {
  const me = await customerWith(100);

  const results = await Promise.all([
    usePoints(makeDeps(env), { useId: "race-a", customerId: me, points: 100, now }),
    usePoints(makeDeps(env), { useId: "race-b", customerId: me, points: 100, now }),
  ]);

  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(await balance(me)).toBe(0);
});
