import type { RedisClient } from '../../../../infrastructure/redis/client';
import type { ReminderQueue } from '../../application/ports';

const QUEUE_KEY = 'reminders:due';

/**
 * Atomically pops up to `limit` members whose score (epoch ms) is <= now.
 * ZRANGEBYSCORE + ZREM in one Lua script so concurrent workers never claim the
 * same id twice (the whole script runs atomically on the Redis server).
 */
const CLAIM_SCRIPT = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then
  redis.call('ZREM', KEYS[1], unpack(due))
end
return due
`;

/**
 * Redis sorted-set reminder queue. Score = scheduled epoch ms. Durable across
 * restarts; safe for multiple workers (atomic claim). The id persists in the
 * notifications table too, so a lost queue entry can be rebuilt from findDue.
 */
export class RedisReminderQueue implements ReminderQueue {
  constructor(private readonly redis: RedisClient) {}

  async enqueue(notificationId: string, scheduledAt: Date): Promise<void> {
    await this.redis.zadd(QUEUE_KEY, scheduledAt.getTime(), notificationId);
  }

  async claimDue(now: Date, limit: number): Promise<string[]> {
    const result = (await this.redis.eval(
      CLAIM_SCRIPT,
      1,
      QUEUE_KEY,
      String(now.getTime()),
      String(limit),
    )) as string[] | null;
    return result ?? [];
  }

  async remove(notificationId: string): Promise<void> {
    await this.redis.zrem(QUEUE_KEY, notificationId);
  }
}
