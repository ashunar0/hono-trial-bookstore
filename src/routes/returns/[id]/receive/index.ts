import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { receiveReturn } from "#/domains/return/index";
import { ReturnStatusConflict } from "#/domains/return/rules";
import { readReturn } from "../../_read";
import { returnResponseSchema } from "../../_response";

/** Staff got the books back: the money is refunded and the books go back on the shelf */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: returnResponseSchema, ...errorResponses(NotFound, ReturnStatusConflict) },
  },
  async (c, reply) => {
    const result = await receiveReturn(c.var.deps, {
      returnId: c.req.valid("param").id,
      by: "staff",
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readReturn(c.var.deps.db, result.value));
  },
);
