import { z } from "zod";
import { allowAnonymous, createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { editBook, findBook } from "#/domains/book/index";
import { stocksOf } from "#/domains/inventory/index";
import { noStock } from "#/domains/inventory/rules";
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
    const { db } = c.var.deps;
    const row = await findBook(db, c.req.valid("param").id);
    if (row === undefined) return reply.failure(NotFound.code);
    const stocks = await stocksOf(db, [row.id]);

    return reply.success(bookResponse(row, stocks.get(row.id) ?? noStock));
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
    const stocks = await stocksOf(c.var.deps.db, [result.value.id]);

    return reply.success(bookResponse(result.value, stocks.get(result.value.id) ?? noStock));
  },
);
