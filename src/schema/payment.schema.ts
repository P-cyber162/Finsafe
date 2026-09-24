import { z } from "zod";

export const CURRENCIES = ["GHS", "USD", "GBP"] as const;

export const processPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES),
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
