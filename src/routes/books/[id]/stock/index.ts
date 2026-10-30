import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { quantitySchema, setStock, StockChanged } from "#/domains/inventory/index";
import { stockResponseSchema } from "../../_response";

/** Staff set the count. version is the one read with GET /books/:id (0 when the book has never had stock) */
export const PUT = createEndpoint(
  {
    auth: requireRole("staff"),
    request: {
      param: z.object({ id: z.string() }),
      json: z.object({ quantity: quantitySchema, version: z.int().min(0) }),
    },
    responses: { 200: stockResponseSchema, ...errorResponses(NotFound, StockChanged) },
  },
  async (c, reply) => {
    const result = await setStock(c.var.deps, {
      bookId: c.req.valid("param").id,
      ...c.req.valid("json"),
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(result.value);
  },
);
