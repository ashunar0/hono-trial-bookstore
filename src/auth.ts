/**
 * The auth provider (Better Auth, email and password). It owns the user, session, account and verification tables
 * and the routes under /api/auth. Built per request from env, like deps: the D1 binding is only there in a request
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { wireDb } from "./db/index";
import { account, session, user, verification } from "./db/auth-schema";

export const makeAuth = (env: Env) =>
  betterAuth({
    database: drizzleAdapter(wireDb(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Customers sign up themselves, so sign-up stays open
    emailAndPassword: { enabled: true },
  });

/** Who is signed in, from Better Auth's session cookie in headers; null when signed out. requireAuth calls it */
export const sessionUserOf = (auth: ReturnType<typeof makeAuth>) => async (headers: Headers) => {
  const found = await auth.api.getSession({ headers });
  if (found === null) return null;
  const { id, name, email } = found.user;
  return { id, name, email };
};
