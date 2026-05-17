const { createClient } = require('redis');
const config = require('../config');

const redisClient = createClient({ url: config.redisUrl });
let redisReady = false;

redisClient.on('ready', () => {
  redisReady = true;
  console.log('Redis connected');
});

redisClient.on('end', () => {
  redisReady = false;
});

redisClient.on('error', (error) => {
  redisReady = false;
  console.error('Redis error:', error.message);
});

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

function isRedisReady() {
  return redisReady && redisClient.isOpen;
}

async function checkRedis() {
  if (!isRedisReady()) return false;
  const pong = await redisClient.ping();
  return pong === 'PONG';
}

module.exports = {
  redisClient,
  connectRedis,
  isRedisReady,
  checkRedis
};
