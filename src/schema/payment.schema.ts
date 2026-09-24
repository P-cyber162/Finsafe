import { z } from "zod";

export const processPaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string(),
});
