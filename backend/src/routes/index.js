const express = require('express');
const usersRoutes = require('./users.routes');
const productsRoutes = require('./products.routes');
const config = require('../config');
const { redisClient, isRedisReady } = require('../db/redis');
const asyncHandler = require('../utils/asyncHandler');
const { invalidateUsersCache, invalidateProductsCache } = require('../middleware/cache');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'Unified API root',
    server: config.serverId,
    endpoints: {
      users: '/api/users',
      products: '/api/products',
      health: '/health',
      ui: '/ui/'
    }
  });
});

router.get('/status', (req, res) => {
  res.json({
    server: config.serverId,
    nodeEnv: config.nodeEnv,
    cache: {
      redisReady: isRedisReady(),
      usersTtlSeconds: config.usersCacheTtlSeconds,
      productsTtlSeconds: config.productsCacheTtlSeconds
    },
    technologies: ['Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'Redis', 'Nginx', 'Docker Compose']
  });
});

router.delete('/cache', asyncHandler(async (req, res) => {
  await invalidateUsersCache();
  await invalidateProductsCache();

  if (isRedisReady()) {
    const keys = await redisClient.keys('users:*');
    const productKeys = await redisClient.keys('products:*');
    const allKeys = [...keys, ...productKeys];
    if (allKeys.length > 0) await redisClient.del(allKeys);
  }

  res.json({
    server: config.serverId,
    message: 'API cache keys were invalidated'
  });
}));

router.use('/users', usersRoutes);
router.use('/products', productsRoutes);

module.exports = router;
