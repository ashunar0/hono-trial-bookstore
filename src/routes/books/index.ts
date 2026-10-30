import {
  allowAnonymous,
  createEndpoint,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "hono-kit";
import { requireRole } from "#/auth";
import { listBooks, registerBook } from "#/domains/book/index";
import { bookResponse, bookResponseSchema } from "./_response";
import { bookInputSchema } from "./_schema";

/** Newest first */
export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { query: pageQuerySchema() },
    responses: { 200: pageResponseSchema(bookResponseSchema) },
  },
  async (c, reply) => {
    const page = await listBooks(c.var.deps.db, c.req.valid("query"));

    return reply.success(pageResponse(page, bookResponse));
  },
);

export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { json: bookInputSchema },
    responses: { 200: bookResponseSchema },
  },
  async (c, reply) => {
    const result = await registerBook(c.var.deps, {
      book: c.req.valid("json"),
      now: c.get("now"),
    });

    return reply.success(bookResponse(result.value));
  },
);
