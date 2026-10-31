/**
 * A D1 that stops before the first statement whose SQL matches, runs `meanwhile` to the end, then goes on.
 * Pass it as `makeDeps({ ...env, DB: pauseBefore(env.DB, /^delete from "stock_alerts"/, other) })` to make
 * another request come in between this one's read and its write. `Promise.all` cannot: the side with fewer
 * steps finishes first, and the order that breaks things never happens
 */
export const pauseBefore = (
  binding: D1Database,
  match: RegExp,
  meanwhile: () => Promise<unknown>,
): D1Database => {
  let fired = false;
  const pause = async (sql: string) => {
    if (fired || !match.test(sql)) return;
    fired = true;
    await meanwhile();
  };
  // What the wrapped statements stand for: the SQL to match, and the real one D1's batch takes
  const original = new WeakMap<D1PreparedStatement, { sql: string; stmt: D1PreparedStatement }>();

  const wrap = (stmt: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = new Proxy(stmt, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql);
        if (key === "run" || key === "all" || key === "first" || key === "raw")
          return async (...args: unknown[]) => {
            await pause(sql);
            return (target[key] as (...a: unknown[]) => unknown).apply(target, args);
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    original.set(wrapped, { sql, stmt });
    return wrapped;
  };

  return new Proxy(binding, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      if (key === "batch")
        return async (stmts: D1PreparedStatement[]) => {
          for (const s of stmts) await pause(original.get(s)?.sql ?? "");
          return target.batch(stmts.map((s) => original.get(s)?.stmt ?? s));
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};
