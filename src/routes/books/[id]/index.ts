import { z } from "zod";
import { allowAnonymous, createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { editBook, findBook } from "#/domains/book/index";
import { bookResponse, bookResponseSchema } from "../_response";
import { bookInputSchema } from "../_schema";

const param = z.object({ id: z.string() });

export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { param },
    responses: { 200: bookResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const row = await findBook(c.var.deps.db, c.req.valid("param").id);
    if (row === undefined) return reply.failure(NotFound.code);

    return reply.success(bookResponse(row));
  },
);

export const PUT = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param, json: bookInputSchema },
    responses: { 200: bookResponseSchema, ...errorResponses(NotFound) },
  },
  async (c, reply) => {
    const result = await editBook(c.var.deps, {
      id: c.req.valid("param").id,
      book: c.req.valid("json"),
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(bookResponse(result.value));
  },
);
