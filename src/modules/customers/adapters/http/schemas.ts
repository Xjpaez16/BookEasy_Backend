import { z } from 'zod';

const phone = z.string().max(32).nullish();
const email = z.string().email().max(320).nullish();

export const createCustomerSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone,
  email,
  notes: z.string().max(2000).nullish(),
});

export const updateCustomerSchema = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    phone,
    email,
    notes: z.string().max(2000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export const listCustomersQuerySchema = z.object({
  search: z.string().max(200).optional(),
});

export type CreateCustomerBody = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerSchema>;
