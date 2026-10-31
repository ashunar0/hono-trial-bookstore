import { createApp } from "hono-kit";
import { createWorker } from "hono-kit/worker";
import { makeAuth, sessionUserOf } from "./auth";
import { wireDb } from "./db/index";
import { logMailer, type Mailer } from "./lib/mailer";
import { crons, registerRoutes } from "./routes.gen";

/** What handlers, middleware and jobs read in c.var.deps. Built per request; tests swap parts of it */
export const makeDeps = (env: Env, overrides: { mailer?: Mailer } = {}) => {
  const auth = makeAuth(env);
  return {
    db: wireDb(env.DB),
    auth,
    sessionUser: sessionUserOf(auth),
    // No real mail service yet: it logs. Tests pass one that collects what was sent
    mailer: overrides.mailer ?? logMailer,
  };
};

export const buildApp = (deps = makeDeps, clock?: () => Date) => {
  const app = createApp({ makeDeps: deps, clock });
  // The app's own middleware (an error page, CORS, ...) goes here, before the routes
  // Sign-up, sign-in and sign-out are Better Auth's own routes (POST /api/auth/sign-up/email, ...)
  app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.deps.auth.handler(c.req.raw));
  registerRoutes(app);
  return app;
};

export default createWorker({ makeDeps, fetch: buildApp().fetch, crons });
