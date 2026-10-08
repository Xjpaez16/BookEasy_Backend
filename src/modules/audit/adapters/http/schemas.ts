import { z } from 'zod';

/** Query params are strings on the wire; coerce numeric pagination here. */
export const listAuditLogsQuerySchema = z.object({
  action: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ListAuditLogsQueryParams = z.infer<typeof listAuditLogsQuerySchema>;
