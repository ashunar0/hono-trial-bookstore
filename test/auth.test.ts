import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { user } from "#/db/schema";
import { buildApp, makeDeps } from "#/main";
import { db } from "./fixtures";

// The real sessionUser and Better Auth, not the stand-in of appAs
const app = () => buildApp(makeDeps);

const signUp = async (email: string, extra: Record<string, unknown> = {}) => {
  const res = await app().request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct horse battery", name: "me", ...extra }),
    },
    env,
  );
  expect(res.status).toBe(200);
  // "better-auth.session_token=...; Path=/; HttpOnly" → the name=value pair a browser sends back
  const [pair] = (res.headers.get("Set-Cookie") ?? "").split(";");
  if (pair === undefined || pair === "") throw new Error("no session cookie");
  return pair;
};

it("anyone can sign up, and the session cookie reads back as that account", async () => {
  const email = `${crypto.randomUUID()}@example.com`;
  const cookie = await signUp(email);

  const signedIn = await makeDeps(env).sessionUser(new Headers({ Cookie: cookie }));

  expect(signedIn?.email).toBe(email);
});

it("a made-up cookie is signed out", async () => {
  const signedIn = await makeDeps(env).sessionUser(
    new Headers({ Cookie: "better-auth.session_token=forged" }),
  );

  expect(signedIn).toBeNull();
});

it("a role sent on sign-up is ignored: everyone starts as a customer", async () => {
  const email = `${crypto.randomUUID()}@example.com`;
  await signUp(email, { role: "staff" });

  const [row] = await db().select({ role: user.role }).from(user).where(eq(user.email, email));

  expect(row?.role).toBe("customer");
});
