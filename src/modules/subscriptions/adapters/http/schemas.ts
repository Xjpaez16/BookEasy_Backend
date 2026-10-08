import { z } from 'zod';

export const changePlanSchema = z.object({
  plan: z.enum(['FREE', 'PRO']),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
