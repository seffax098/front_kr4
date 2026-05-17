require('dotenv').config();

const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  nodeEnv: env.NODE_ENV || 'development',
  serverId: env.SERVER_ID || 'backend-local',
  databaseUrl: env.DATABASE_URL || 'postgres://app:app_password@localhost:5432/fullstack_sql',
  mongoUri: env.MONGO_URI || 'mongodb://app:app_password@localhost:27017/fullstack_nosql?authSource=admin',
  redisUrl: env.REDIS_URL || 'redis://localhost:6379',
  usersCacheTtlSeconds: Number(env.USERS_CACHE_TTL_SECONDS || 60),
  productsCacheTtlSeconds: Number(env.PRODUCTS_CACHE_TTL_SECONDS || 600)
};

module.exports = config;
