const Redis = require('ioredis');

let redisClient = null;
let isConnected = false;

const REDIS_CONFIG = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 3) {
      console.warn('⚠️ Redis: Max retries reached, using fallback cache');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
};

function createRedisClient() {
  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.warn('⚠️ Redis URL not configured. Using in-memory fallback cache.');
    return null;
  }

  try {
    // Validate Redis URL before connecting
    const url = new URL(redisUrl);
    if (!url.hostname || url.hostname === 'base' || url.hostname.length < 3) {
      console.warn('⚠️ Invalid Redis URL hostname. Using in-memory fallback cache.');
      return null;
    }
    
    const client = new Redis(redisUrl, REDIS_CONFIG);

    client.on('connect', () => {
      console.log('✅ Redis connected successfully');
      isConnected = true;
    });

    client.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
      isConnected = false;
    });

    client.on('close', () => {
      console.log('🔌 Redis connection closed');
      isConnected = false;
    });

    return client;
  } catch (error) {
    console.error('❌ Failed to create Redis client:', error.message);
    return null;
  }
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

function isRedisConnected() {
  return isConnected && redisClient !== null;
}

const memoryCache = new Map();

const cache = {
  async get(key) {
    const client = getRedisClient();
    if (client && isConnected) {
      try {
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
      } catch (err) {
        console.warn('Redis GET error, using memory cache:', err.message);
      }
    }
    const cached = memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    memoryCache.delete(key);
    return null;
  },

  async set(key, value, ttlSeconds = 60) {
    const client = getRedisClient();
    if (client && isConnected) {
      try {
        await client.setex(key, ttlSeconds, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn('Redis SET error, using memory cache:', err.message);
      }
    }
    memoryCache.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
    return true;
  },

  async del(key) {
    const client = getRedisClient();
    if (client && isConnected) {
      try {
        await client.del(key);
      } catch (err) {
        console.warn('Redis DEL error:', err.message);
      }
    }
    memoryCache.delete(key);
  },

  async invalidatePattern(pattern) {
    const client = getRedisClient();
    if (client && isConnected) {
      try {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } catch (err) {
        console.warn('Redis invalidatePattern error:', err.message);
      }
    }
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        memoryCache.delete(key);
      }
    }
  },

  async flush() {
    const client = getRedisClient();
    if (client && isConnected) {
      try {
        await client.flushdb();
      } catch (err) {
        console.warn('Redis flush error:', err.message);
      }
    }
    memoryCache.clear();
  }
};

module.exports = {
  getRedisClient,
  isRedisConnected,
  cache,
  REDIS_CONFIG
};
