import { env } from "cloudflare:workers";
import type { SessionUser } from "hono-kit";
import { expect, it } from "vitest";
import { requireRole } from "#/auth";
import { alice, appAs, carol } from "./fixtures";

// No endpoint uses it yet, so a test-only path stands in for one
const call = (user: SessionUser | null) => {
  const app = appAs(user);
  app.get("/staff-only", requireRole("staff"), (c) => c.json({ id: c.var.currentUser.id }));
  return app.request("/staff-only", {}, env);
};

it("lets the role through, with currentUser set", async () => {
  const res = await call(carol);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: "carol" });
});

it("answers 403 to another role", async () => {
  const res = await call(alice);

  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
});

it("answers 401 when signed out", async () => {
  const res = await call(null);

  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
});
