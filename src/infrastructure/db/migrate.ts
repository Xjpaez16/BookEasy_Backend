import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sql } from './client';

/** Applies pending Drizzle migrations from ./drizzle. */
async function main(): Promise<void> {
  await migrate(db, { migrationsFolder: './drizzle' });
  await sql.end();
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
