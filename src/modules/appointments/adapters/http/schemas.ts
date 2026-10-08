import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true });

export const createAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startAt: isoDate,
  notes: z.string().max(2000).nullish(),
});

export const rescheduleSchema = z.object({
  startAt: isoDate,
});

export const listQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  staffId: z.string().uuid().optional(),
});

const hourEntry = z.object({
  weekday: z.number().int().min(0).max(6),
  openMinute: z.number().int().min(0).max(1440),
  closeMinute: z.number().int().min(0).max(1440),
});

export const setHoursSchema = z.object({
  hours: z.array(hourEntry).max(50),
});

export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;
export type RescheduleBody = z.infer<typeof rescheduleSchema>;
export type SetHoursBody = z.infer<typeof setHoursSchema>;
