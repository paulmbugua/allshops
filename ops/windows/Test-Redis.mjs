import { createRequire } from 'node:module';

const requireFromWorker = createRequire(
  new URL('../../apps/worker/package.json', import.meta.url),
);
const Redis = requireFromWorker('ioredis');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL is required.');
}

const redis = new Redis(redisUrl, {
  connectTimeout: 5000,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 0,
});
redis.on('error', () => {
  // Connection failures are reported by the awaited preflight commands.
});

const keyPrefix = `allshops:preflight:${process.pid}:${Date.now()}`;

try {
  await redis.connect();
  if ((await redis.ping()) !== 'PONG') {
    throw new Error('Redis-compatible service did not return PONG.');
  }

  await redis.set(`${keyPrefix}:string`, 'ready', 'PX', 30000);
  if ((await redis.get(`${keyPrefix}:string`)) !== 'ready') {
    throw new Error('String command verification failed.');
  }

  await redis.hset(`${keyPrefix}:hash`, 'status', 'ready');
  await redis.lpush(`${keyPrefix}:list`, 'ready');
  await redis.zadd(`${keyPrefix}:sorted`, 1, 'ready');
  await redis.xadd(`${keyPrefix}:stream`, '*', 'status', 'ready');

  const scripted = await redis.eval(
    "return redis.call('GET', KEYS[1])",
    1,
    `${keyPrefix}:string`,
  );
  if (scripted !== 'ready') {
    throw new Error('Lua scripting verification failed.');
  }

  console.log('Redis protocol preflight passed: PING, strings, hashes, lists, sorted sets, streams, and Lua.');
} finally {
  try {
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Preserve the original verification failure if cleanup cannot run.
  }
  redis.disconnect();
}
