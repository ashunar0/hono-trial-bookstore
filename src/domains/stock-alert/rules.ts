/**
 * Stock alerts ("tell me when this book is back"). Imports nothing but zod
 */
import { z } from "zod";

export const stockAlertStatuses = ["waiting", "sending", "sent", "failed"] as const;

export type StockAlertStatus = (typeof stockAlertStatuses)[number];

/** How many times the mail is tried before the alert is given up (failed) */
export const maxAttempts = 3;

/** An alert still to be sent: at most one per customer and book */
export const isOpen = (status: StockAlertStatus) => status === "waiting" || status === "sending";

/** Only a waiting alert can be cancelled: once sending, the mail may already have gone */
export const canCancel = (status: StockAlertStatus) => status === "waiting";

/** Whether this many copies is a book a customer could just buy */
export const inStock = (quantity: number) => quantity >= 1;

/** The mail for a book that is back */
export const stockAlertMail = (title: string) => ({
  subject: `「${title}」が入荷しました`,
  body: `お知らせを登録していた「${title}」が入荷しました。在庫がなくなる前にご注文ください。`,
});

export const StockAvailable = {
  code: "STOCK_AVAILABLE",
  kind: "conflict",
  message: "The book is in stock, so it can be bought now",
} as const;

export const StockAlertStatusConflict = {
  code: "STOCK_ALERT_STATUS_CONFLICT",
  kind: "conflict",
  message: "The alert is already being sent, so it can no longer be cancelled",
  details: z.object({ status: z.enum(stockAlertStatuses) }),
} as const;
