/**
 * The auth provider (Better Auth, email and password). It owns the user, session, account and verification tables
 * and the routes under /api/auth. Built once at startup with the database, like deps.
 * Better Auth reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment itself
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createMiddleware } from "hono/factory";
import {
  type CurrentUser,
  type DepsVariables,
  fail,
  Forbidden,
  getCurrentUser,
  guard,
  Unauthorized,
} from "hono-kit";
import type { Db } from "./db/index";
import { account, roles, session, user, verification } from "./db/auth-schema";

export const makeAuth = (db: Db) =>
  betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    // input: false, so a role sent on sign-up is ignored and everyone starts as a customer
    user: {
      additionalFields: { role: { type: [...roles], defaultValue: "customer", input: false } },
    },
    // Customers sign up themselves, so sign-up stays open
    emailAndPassword: { enabled: true },
  });

/** Who is signed in, from Better Auth's session cookie in headers; null when signed out. requireAuth calls it */
export const sessionUserOf = (auth: ReturnType<typeof makeAuth>) => async (headers: Headers) => {
  const found = await auth.api.getSession({ headers });
  if (found === null) return null;
  const { id, name, email, role } = found.user;
  return { id, name, email, role };
};

/**
 * Requires sign-in with this role: `auth: requireRole("staff")`. 401 signed out, 403 another role.
 * Only for a permission the role alone decides; one that needs the row is checked in code after reading it
 */
export const requireRole = (role: (typeof roles)[number]) =>
  guard(
    [Unauthorized, Forbidden],
    createMiddleware<{ Variables: { currentUser: CurrentUser } & DepsVariables }>(
      async (c, next) => {
        const user = await getCurrentUser(c);
        if (user === null) throw fail(Unauthorized);
        if (user.role !== role) throw fail(Forbidden);
        c.set("currentUser", user);
        await next();
      },
    ),
  );
