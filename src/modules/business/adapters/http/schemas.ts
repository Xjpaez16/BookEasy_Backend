import { z } from 'zod';

export const createBusinessSchema = z.object({
  name: z.string().min(2).max(200),
  timezone: z.string().min(1).max(64).optional(),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug')
    .optional(),
});

export const updateBusinessSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.name !== undefined || v.timezone !== undefined, {
    message: 'At least one field must be provided',
  });

export const inviteStaffSchema = z.object({
  email: z.string().email().max(320),
  fullName: z.string().min(1).max(200),
  role: z.enum(['OWNER', 'STAFF']),
});

export const changeRoleSchema = z.object({
  role: z.enum(['OWNER', 'STAFF']),
});

export type CreateBusinessBody = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessBody = z.infer<typeof updateBusinessSchema>;
export type InviteStaffBody = z.infer<typeof inviteStaffSchema>;
export type ChangeRoleBody = z.infer<typeof changeRoleSchema>;
