import { z } from 'zod';

const priceMinor = z.number().int().min(0);
const duration = z.number().int().positive().max(1440);
const currency = z.string().regex(/^[A-Za-z]{3}$/, 'Invalid currency');

export const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  durationMinutes: duration,
  priceMinor: priceMinor.optional(),
  currency: currency.optional(),
});

export const updateServiceSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    durationMinutes: duration.optional(),
    priceMinor: priceMinor.optional(),
    currency: currency.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateServiceBody = z.infer<typeof createServiceSchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>;
