/**
 * In a real project, `pnpm wrangler types` can generate this.
 * When you add a binding (D1, queue, secret, ...) to wrangler.jsonc, add it here too
 */
declare global {
  // env from cloudflare:workers is typed as Cloudflare.Env, so connect it to this app's Env
  namespace Cloudflare {
    interface Env extends globalThis.Env {}
  }

  interface Env {
    DB: D1Database;
    /** Signs Better Auth's sessions. A secret: `wrangler secret put BETTER_AUTH_SECRET`, .dev.vars locally */
    BETTER_AUTH_SECRET: string;
    /** Where the app is served (http://localhost:8787 locally) */
    BETTER_AUTH_URL: string;
  }
}

export {};
