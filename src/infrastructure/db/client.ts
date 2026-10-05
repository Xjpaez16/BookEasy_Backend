import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { loadConfig } from '../../config/env';

const config = loadConfig();

// Single pooled client for the app. Workers create their own.
export const sql = postgres(config.DATABASE_URL, {
  max: config.NODE_ENV === 'production' ? 20 : 5,
  prepare: true,
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;
export { schema };
