const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const apiRoutes = require('./routes');
const { initPostgres, checkPostgres, pool, normalizeProductRow } = require('./db/postgres');
const { connectMongo, checkMongo, mongoose } = require('./db/mongo');
const { connectRedis, checkRedis, redisClient } = require('./db/redis');
const { ProductDocument } = require('./models/ProductDocument');
const { HttpError } = require('./utils/errors');
const { unixNow } = require('./utils/time');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

async function safeCheck(name, checkFn) {
  try {
    return await checkFn();
  } catch (error) {
    console.error(`${name} health check failed:`, error.message);
    return false;
  }
}

app.get('/', (req, res) => {
  res.json({
    message: 'Response from unified backend server',
    server: config.serverId,
    ui: '/ui/',
    api: '/api',
    technologies: ['PostgreSQL', 'MongoDB', 'Redis', 'Nginx/HAProxy load balancing', 'Docker Compose']
  });
});

app.get('/health', async (req, res) => {
  const services = {
    postgres: await safeCheck('PostgreSQL', checkPostgres),
    mongo: await safeCheck('MongoDB', checkMongo),
    redis: await safeCheck('Redis', checkRedis)
  };
  const ok = Object.values(services).every(Boolean);

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    server: config.serverId,
    services
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    server: config.serverId,
    error: 'Route not found'
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error('Request error:', error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({
      server: config.serverId,
      error: error.message,
      details: error.details
    });
  }

  if (error && error.code === '23505') {
    return res.status(409).json({
      server: config.serverId,
      error: 'PostgreSQL unique constraint violation',
      details: error.detail
    });
  }

  if (error && error.name === 'ValidationError') {
    return res.status(400).json({
      server: config.serverId,
      error: 'MongoDB validation error',
      details: error.message
    });
  }

  return res.status(500).json({
    server: config.serverId,
    error: 'Internal server error'
  });
});

async function ensureMongoDocumentsForSeedProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC;');
  const products = rows.map(normalizeProductRow);

  for (const product of products) {
    try {
      await ProductDocument.updateOne(
        { sqlProductId: product.id },
        {
          $setOnInsert: {
            sqlProductId: product.id,
            tags: ['seed', 'demo'],
            stock: product.id === 1 ? 10 : 25,
            attributes: {
              demo: true,
              source: 'startup-seed'
            },
            warehouse: 'main',
            sourceServer: config.serverId,
            created_at: unixNow(),
            updated_at: unixNow()
          }
        },
        { upsert: true }
      ).exec();
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}

async function start() {
  await initPostgres();
  console.log('PostgreSQL initialized');

  await connectMongo();
  console.log('MongoDB connected');

  await connectRedis();

  await ensureMongoDocumentsForSeedProducts();

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`${config.serverId} listening on port ${config.port}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down ${config.serverId}`);
    server.close(async () => {
      await Promise.allSettled([
        pool.end(),
        mongoose.disconnect(),
        redisClient.quit()
      ]);
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
