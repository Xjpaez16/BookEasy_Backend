import Redis from 'ioredis';
import { loadConfig } from '../../config/env';

const config = loadConfig();

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export type RedisClient = Redis;
