import {
  allowAnonymous,
  createEndpoint,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "hono-kit";
import { requireRole } from "#/auth";
import { listBooks, registerBook } from "#/domains/book/index";
import { noStock, stocksOf } from "#/domains/inventory/index";
import { bookResponse, bookResponseSchema } from "./_response";
import { bookInputSchema } from "./_schema";

/** Newest first, with each book's stock */
export const GET = createEndpoint(
  {
    auth: allowAnonymous,
    request: { query: pageQuerySchema() },
    responses: { 200: pageResponseSchema(bookResponseSchema) },
  },
  async (c, reply) => {
    const { db } = c.var.deps;
    const page = await listBooks(db, c.req.valid("query"));
    const stocks = await stocksOf(
      db,
      page.items.map((book) => book.id),
    );

    return reply.success(
      pageResponse(page, (book) => bookResponse(book, stocks.get(book.id) ?? noStock)),
    );
  },
);

/** A new book has no stock until staff set it */
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

    return reply.success(bookResponse(result.value, noStock));
  },
);
