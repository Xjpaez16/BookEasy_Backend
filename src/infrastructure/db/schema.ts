import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

/**
 * Core multi-tenant schema for Agenda Pro.
 *
 * Rules enforced here:
 * - All timestamps are UTC (timestamptz). Business timezone stored separately.
 * - Money uses NUMERIC (price_minor as integer minor units on services).
 * - Tenant-first composite indexes on every business-scoped table.
 * - Historical appointments are never physically deleted; soft-delete where noted.
 */

export const membershipRole = pgEnum('membership_role', ['OWNER', 'STAFF']);
export const appointmentStatus = pgEnum('appointment_status', [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export const notificationChannel = pgEnum('notification_channel', ['WHATSAPP', 'EMAIL']);
export const notificationStatus = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
]);
export const subscriptionPlan = pgEnum('subscription_plan', ['FREE', 'PRO']);
export const subscriptionStatus = pgEnum('subscription_status', [
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex('businesses_slug_unique').on(t.slug),
}));

export const businessMembers = pgTable(
  'business_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: membershipRole('role').notNull().default('STAFF'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('members_business_idx').on(t.businessId),
    uniqueMembership: uniqueIndex('members_business_user_unique').on(
      t.businessId,
      t.userId,
    ),
  }),
);

export const businessHours = pgTable(
  'business_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    // 0 = Sunday ... 6 = Saturday
    weekday: integer('weekday').notNull(),
    // minutes from midnight, in the business timezone
    openMinute: integer('open_minute').notNull(),
    closeMinute: integer('close_minute').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('hours_business_idx').on(t.businessId, t.weekday),
  }),
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    // integer minor units (e.g. cents) to avoid floating point
    priceMinor: integer('price_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    active: boolean('active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('services_business_idx').on(t.businessId),
  }),
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 320 }),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('customers_business_idx').on(t.businessId),
  }),
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    serviceId: uuid('service_id').notNull().references(() => services.id),
    staffId: uuid('staff_id').notNull().references(() => businessMembers.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: appointmentStatus('status').notNull().default('SCHEDULED'),
    priceMinor: integer('price_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Tenant-first index tuned for calendar + overlap queries per staff member.
    byBusinessStaffTime: index('appointments_business_staff_time_idx').on(
      t.businessId,
      t.staffId,
      t.startAt,
    ),
    byBusinessTime: index('appointments_business_time_idx').on(t.businessId, t.startAt),
  }),
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    channel: notificationChannel('channel').notNull(),
    status: notificationStatus('status').notNull().default('PENDING'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('notifications_business_idx').on(t.businessId),
    byScheduled: index('notifications_scheduled_idx').on(t.status, t.scheduledAt),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull().references(() => businesses.id),
    plan: subscriptionPlan('plan').notNull().default('FREE'),
    status: subscriptionStatus('status').notNull().default('ACTIVE'),
    priceMinor: integer('price_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: uniqueIndex('subscriptions_business_unique').on(t.businessId),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('refresh_tokens_user_idx').on(t.userId),
    byHash: uniqueIndex('refresh_tokens_hash_unique').on(t.tokenHash),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id'),
    actorUserId: uuid('actor_user_id'),
    action: varchar('action', { length: 120 }).notNull(),
    targetType: varchar('target_type', { length: 80 }),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBusiness: index('audit_business_idx').on(t.businessId, t.createdAt),
  }),
);
