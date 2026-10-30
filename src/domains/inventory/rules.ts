/**
 * Stock. Imports nothing but zod
 */
import { z } from "zod";

/** How many copies are in stock */
export const quantitySchema = z.int().min(0);

/** What a book with no stock row shows: none, and version 0 so the first set makes the row */
export const noStock = { quantity: 0, version: 0 } as const;

export const StockChanged = {
  code: "STOCK_CHANGED",
  kind: "conflict",
  message:
    "The stock changed after it was read (an order, or another edit). Read it again and set that",
} as const;
