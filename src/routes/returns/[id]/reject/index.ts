import { z } from "zod";
import { createEndpoint, errorResponses, NotFound } from "hono-kit";
import { requireRole } from "#/auth";
import { rejectReturn } from "#/domains/return/index";
import { ReturnStatusConflict } from "#/domains/return/rules";
import { readReturn } from "../../_read";
import { returnResponseSchema } from "../../_response";

/** Staff turn the return down, with a word on why (it never came, it is damaged) */
export const POST = createEndpoint(
  {
    auth: requireRole("staff"),
    request: {
      param: z.object({ id: z.string() }),
      json: z.object({ reason: z.string().trim().min(1).max(200) }),
    },
    responses: { 200: returnResponseSchema, ...errorResponses(NotFound, ReturnStatusConflict) },
  },
  async (c, reply) => {
    const result = await rejectReturn(c.var.deps, {
      returnId: c.req.valid("param").id,
      reason: c.req.valid("json").reason,
      now: c.get("now"),
    });
    if (!result.ok) return reply.failure(result.error);

    return reply.success(await readReturn(c.var.deps.db, result.value));
  },
);
