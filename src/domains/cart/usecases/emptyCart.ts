import { ok, type DepsVariables, type UserId } from "hono-kit";
import { deleteCartOf } from "../mutations";

/** Takes everything out, once the order is placed */
export const emptyCart = async (deps: DepsVariables["deps"], input: { customerId: UserId }) => {
  await deleteCartOf(deps.db, input.customerId);

  return ok({});
};
