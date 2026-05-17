const config = require('../config');
const { redisClient, isRedisReady } = require('../db/redis');

function cacheMiddleware(keyBuilder, ttlSeconds) {
  return async function readThroughCache(req, res, next) {
    if (!isRedisReady()) {
      return next();
    }

    const key = keyBuilder(req);
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        return res.json({
          source: 'cache',
          server: config.serverId,
          cacheKey: key,
          data: JSON.parse(cached)
        });
      }

      res.locals.cacheKey = key;
      res.locals.cacheTtlSeconds = ttlSeconds;
      return next();
    } catch (error) {
      console.error('Cache read error:', error.message);
      return next();
    }
  };
}

async function saveToCache(key, data, ttlSeconds) {
  if (!key || !ttlSeconds || !isRedisReady()) return;

  try {
    await redisClient.set(key, JSON.stringify(data), { EX: ttlSeconds });
  } catch (error) {
    console.error('Cache save error:', error.message);
  }
}

async function deleteCacheKeys(keys) {
  if (!isRedisReady()) return;
  const normalizedKeys = keys.filter(Boolean);
  if (normalizedKeys.length === 0) return;

  try {
    await redisClient.del(normalizedKeys);
  } catch (error) {
    console.error('Cache delete error:', error.message);
  }
}

async function invalidateUsersCache(userId = null) {
  await deleteCacheKeys(['users:all', userId ? `users:${userId}` : null]);
}

async function invalidateProductsCache(productId = null) {
  await deleteCacheKeys(['products:all', productId ? `products:${productId}` : null]);
}

module.exports = {
  cacheMiddleware,
  saveToCache,
  invalidateUsersCache,
  invalidateProductsCache
};
