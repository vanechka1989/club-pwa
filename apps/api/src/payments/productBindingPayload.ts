import { z } from "zod";

export const productBindingPayloadSchema = z.object({
  provider: z.enum(["prodamus", "lava"]),
  enabled: z.boolean(),
  externalProductId: z.string().trim().max(160).nullable(),
  externalOfferId: z.string().trim().max(160).nullable(),
  prices: z.array(z.object({
    currency: z.enum(["RUB", "USD", "EUR"]),
    amountMinor: z.number().int(),
    isEnabled: z.boolean()
  })).default([])
});
