/**
 * The cart. Imports nothing but zod
 */
import { z } from "zod";

/** How many of a book. Taking it out is DELETE, not 0. Stock is not checked here: placing the order checks it */
export const cartQuantitySchema = z.int().min(1);
