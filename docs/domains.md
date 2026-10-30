# Domains

<!-- The original of this page and lint/domains.mjs is ~/dev/hono/hono-trials/kakeibo. Other projects copy both from there: change them there first, then copy again. -->

The business rules live in `src/domains/<noun>/`, outside the routes. Every domain has the same kinds of file, and **what a file imports decides which kind it is**, so where a function goes is never a judgment of size. Between domains the rules are those of a modular monolith: one app and one database, split into domains that touch each other only through what each one publishes. `lint/domains.mjs` (rule `domains/imports`) stops an import that breaks the tables below.

```
src/domains/<noun>/
  index.ts            # what other domains and the routes may use: rules, queries, usecases
  rules.ts            # no I/O: values, plain functions, failures, the shapes of values (monthSchema)
  queries.ts          # reads (SELECT) of this domain's tables
  mutations.ts        # writes (INSERT / UPDATE / DELETE) of this domain's tables
  usecases/<verb>.ts  # one operation: read, check, write. Named by a verb (recordExpense)
  usecases/_<name>.ts # a part two usecases of this domain share (usecases/_withinBudget.ts)
```

## Inside a domain: where a function goes

1. Needs no database, no deps, no HTTP → `rules.ts`
2. Only reads → `queries.ts`
3. Only writes → `mutations.ts`
4. Anything else (reads and writes, reads another domain, uses deps, decides from what it read) → `usecases/<verb>.ts`, in the domain that owns the table it writes

A read that needs several domains and writes nothing (a list with a flag from another domain, a summary) is put together in the route: it calls each domain's queries and combines the results. It is not a usecase, since a usecase is for a write.

## Between domains

1. **Another domain is read only through its `index.ts`**: `#/domains/budget/index`, never `#/domains/budget/queries`. A domain's own files import each other directly, never their own `index.ts`
2. **`index.ts` publishes rules, queries and usecases only** (`export * from "./rules"`, one line per usecase). Never mutations, never `usecases/_*`
3. **To change another domain's data, call that domain's usecase.** A usecase may call another domain's usecase through its `index.ts`
4. **A table belongs to one domain.** Only that domain's queries and mutations touch it. Another domain reads it through the owner's queries
5. **Domains do not depend on each other in a circle.** Not expense → budget and budget → expense. A circle means something sits in the wrong domain: move what both need where both read it one way. Expenses and budgets both need the list of categories, so it has a domain of its own (`category`, rules only)

### Steps to place something

1. What does the code import? → the kind of file inside the domain
2. Who owns the table? → which domain. A value that is no table's (the categories) goes where everyone who needs it can read it one way
3. What does it touch in another domain? → only what that domain's `index.ts` shows. If it is not there, add a query or a usecase to the owner

A case these steps do not settle is a hole in the rules: stop and ask.

## What each file may import

| File                         | May import                                                                                                                               | May not                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `index.ts`                   | its own domain's rules, queries, usecases                                                                                                | mutations, `usecases/_*`, anything outside its domain                    |
| `rules.ts`                   | its own rules, another domain's rules (through `index.ts`), a schema library (zod), types                                                | drizzle, `#/db`, hono, hono-kit (values), queries / mutations / usecases |
| `queries.ts`, `mutations.ts` | `#/db`, drizzle, hono-kit, its own domain's files, another domain's rules (through `index.ts`)                                           | another domain's queries / mutations / usecases, its own usecases        |
| `usecases/*`                 | its own domain's queries / mutations / rules / `usecases/_*`, another domain's rules / queries / usecases (through `index.ts`), hono-kit | drizzle, another usecase of its own domain (share through `usecases/_*`) |
| `src/routes/**`              | a domain's `index.ts`, its own resource's `_*` files, another resource's `_response.ts`, types from `#/db`                               | a domain's other files, drizzle, `#/db` values, another resource's files |
| `src/db/**`                  | another domain's rules (through `index.ts`), so a table can use a list of values (`categories`)                                          | another domain's queries / usecases                                      |
| anything else                | a domain's `index.ts`                                                                                                                    | `src/routes/**`, a domain's other files                                  |

A shape two resources return (a loan from `POST /books/[id]/borrow` and from `GET /loans`) goes in the `_response.ts` of the resource it is, and the other route imports it from there. It is the API's shape, not a rule: when what the API shows and what the domain holds part ways, only `_response.ts` changes.

## Writing

- **What must be written together lives in one domain.** When two rows must never be written one without the other, their tables belong to the same domain: the domain of the usecase that writes them. A carry-over of a budget is written when a month is closed, so it is the month's, and budget reads it through month's queries
- To write them together, the usecase puts the mutations in one `db.batch([...])` (D1; `db.transaction` on pg). It makes them all happen or none. It does not stop another request coming in between a read and the write: that is the version's job
- Every write goes through a usecase, even one with nothing to check (`setBudget`): otherwise "is there a check?" is a choice made each time, and adding one later moves the code
- `mutations.ts` returns the query, not yet run. The usecase awaits it and reads the result: no row back from an update means it found nothing or lost to another edit
- Forgetting the `await` would run nothing, silently: `typescript/no-floating-promises` with `checkThenables: true` (`oxlint --type-aware`) stops it
- Edits that must not overwrite another's use `updateWithVersion` from `hono-kit/sqlite` in `mutations.ts`
- Check order in a usecase follows hono-kit's rules.md: NOT_FOUND → ... → conflict

## Writing across domains

A usecase that changes several domains holds the steps and calls each domain's usecase in turn (cancelling an order: order → inventory → coupon). The routes and the cron call that one usecase. On D1 the steps cannot be one transaction, so a failure halfway must not break anything:

- **Every step can run twice with the same result.** Giving back stock acts only while the hold is still `reserved` (`UPDATE ... WHERE id = ? AND status = 'reserved'`); a record keyed by the request's id stops a second run
- **The state that decides the outcome is switched at the point of no return**, with the version. Placing an order switches it last: nothing is promised until then. Cancelling switches it first: once stock is given back someone else can buy it, so a payment coming in at the same time must lose before anything is given back
- **A step that died halfway is finished by running it again.** The state shows how far it got, and the cron that already runs (an expired payment, say) calls the usecase again
- On pg, pass `{ ...deps, db: tx }` to each usecase and the whole run becomes one transaction. That is why usecases take the db from deps instead of importing it
- Events between domains are not used while the domains share one database: they are harder to follow than a call. Something that may happen later on its own (a mail) can go through a Queue when it comes up
