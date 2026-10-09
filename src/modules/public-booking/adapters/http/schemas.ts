import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true });

/** POST /public/businesses/:slug/book — the client names a service + a start. */
export const bookPublicSchema = z.object({
  serviceId: z.string().uuid(),
  startAt: isoDate,
  notes: z.string().max(2000).nullish(),
});

/** PATCH /public/appointments/:id — reschedule to a new start. */
export const reschedulePublicSchema = z.object({
  startAt: isoDate,
});

/** GET availability query: ?serviceId=...&date=YYYY-MM-DD */
export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export type BookPublicBody = z.infer<typeof bookPublicSchema>;
export type ReschedulePublicBody = z.infer<typeof reschedulePublicSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
