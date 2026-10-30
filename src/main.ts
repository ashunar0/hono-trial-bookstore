import { createApp } from "hono-kit";
import { makeAuth, sessionUserOf } from "./auth";
import { wireDb } from "./db/index";
import { registerRoutes } from "./routes.gen";

/** Opened once when the process starts, and shared by every request. vitest.config.ts points it to :memory: */
const db = wireDb(process.env.DATABASE_URL ?? "file:data.db");
const auth = makeAuth(db);

/** What handlers, middleware and jobs read in c.var.deps. Tests swap parts of it */
export const makeDeps = () => ({ db, auth, sessionUser: sessionUserOf(auth) });

export const buildApp = (deps = makeDeps, clock?: () => Date) => {
  const app = createApp({ makeDeps: deps, clock });
  // The app's own middleware (an error page, CORS, ...) goes here, before the routes
  // Sign-up, sign-in and sign-out are Better Auth's own routes (POST /api/auth/sign-up/email, ...)
  app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.deps.auth.handler(c.req.raw));
  registerRoutes(app);
  return app;
};
