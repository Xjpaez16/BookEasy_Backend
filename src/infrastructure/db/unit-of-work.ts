import type {
  UnitOfWork,
  TransactionContext,
} from '../../shared/application/ports';
import type { Database } from './client';

/**
 * The concrete transaction handle carried through the TransactionContext.
 * Repositories unwrap it via `txDb()` to run inside the open transaction.
 */
export interface DrizzleTxContext extends TransactionContext {
  readonly db: Database;
}

/**
 * Returns the Drizzle query runner for a port call: the transaction's handle
 * when a TransactionContext is supplied, otherwise the shared pooled client.
 */
export function txDb(fallback: Database, tx?: TransactionContext): Database {
  if (tx && (tx as DrizzleTxContext).db) {
    return (tx as DrizzleTxContext).db;
  }
  return fallback;
}

/** Drizzle-backed UnitOfWork. Commits or rolls back the whole unit of work. */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  async withTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const ctx: DrizzleTxContext = {
        _brand: 'TransactionContext',
        db: tx as unknown as Database,
      };
      return work(ctx);
    });
  }
}
