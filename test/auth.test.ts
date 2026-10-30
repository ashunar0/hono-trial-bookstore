import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { buildApp, makeDeps } from "#/main";

// The real sessionUser and Better Auth, not the stand-in of appAs
const app = () => buildApp(makeDeps);

const signUp = async (email: string) => {
  const res = await app().request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct horse battery", name: "me" }),
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

  const user = await makeDeps(env).sessionUser(new Headers({ Cookie: cookie }));

  expect(user?.email).toBe(email);
});

it("a made-up cookie is signed out", async () => {
  const user = await makeDeps(env).sessionUser(
    new Headers({ Cookie: "better-auth.session_token=forged" }),
  );

  expect(user).toBeNull();
});
