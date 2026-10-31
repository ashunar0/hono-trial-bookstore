import { env } from "cloudflare:workers";
import { userId, type SessionUser } from "hono-kit";
import { balanceOf, earnPoints } from "#/domains/point/index";
import { makeDeps } from "#/main";
import { carol, request } from "./fixtures";

export const inNovember = new Date("2026-11-15T10:00:00+09:00");

export type Order = {
  id: string;
  status: string;
  version: number;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  tax: number;
  couponCode: string | null;
  pointsUsed: number;
  paymentDueAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  cancelledAt: string | null;
  lines: {
    id: string;
    bookId: string;
    title: string;
    unitPrice: number;
    quantity: number;
    discount: number;
    points: number;
  }[];
  refunds: { returnId: string | null; amount: number; points: number; tax: number }[];
};

/** A book with this much stock */
export const bookWith = async (price: number, stock: number) => {
  const res = await request(carol, "POST", "/books", {
    title: `本${price}`,
    author: "著者",
    price,
  });
  const { id } = (await res.json()) as { id: string };
  await request(carol, "PUT", `/books/${id}/stock`, { quantity: stock, version: 0 });
  return id;
};

export const stockOf = async (id: string) =>
  ((await (await request(null, "GET", `/books/${id}`)).json()) as { stock: { quantity: number } })
    .stock.quantity;

export const put = (who: SessionUser, bookId: string, quantity: number) =>
  request(who, "PUT", `/cart/items/${bookId}`, { quantity });

/** 500 off from 3,000, usable in November 2026 */
export const fixed500 = async () => {
  const code = `c${crypto.randomUUID().slice(0, 8)}`;
  await request(carol, "POST", "/coupons", {
    code,
    kind: "fixed",
    value: 500,
    minSubtotal: 3000,
    startsAt: "2026-11-01T00:00:00+09:00",
    endsAt: "2026-12-01T00:00:00+09:00",
  });
  return code;
};

export const place = (who: SessionUser, couponCode?: string, points?: number) =>
  request(
    who,
    "POST",
    "/orders",
    {
      ...(couponCode === undefined ? {} : { couponCode }),
      ...(points === undefined ? {} : { points }),
    },
    inNovember,
  );

/** Gives the customer this many points (earned on 100 yen each) */
export const withPoints = async (who: SessionUser, points: number) => {
  await earnPoints(makeDeps(env), {
    earnId: crypto.randomUUID(),
    customerId: userId(who.id),
    yen: points * 100,
    now: inNovember,
  });
};

export const pointsOf = (who: SessionUser) => balanceOf(makeDeps(env).db, who.id);

/** An order of one book, placed in November */
export const placedOrder = async (who: SessionUser, bookId: string, couponCode?: string) => {
  await put(who, bookId, 1);
  return (await (await place(who, couponCode)).json()) as Order;
};

/** Places the cart in November, pays and ships it then */
export const shippedOrder = async (who: SessionUser, couponCode?: string) => {
  const placed = (await (await place(who, couponCode)).json()) as Order;
  await request(who, "POST", `/orders/${placed.id}/pay`, undefined, inNovember);
  return (await (
    await request(carol, "POST", `/orders/${placed.id}/ship`, undefined, inNovember)
  ).json()) as Order;
};
