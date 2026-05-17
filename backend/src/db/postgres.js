const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000
});

async function initPostgres() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1);', [24001923]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        age INTEGER NOT NULL CHECK (age >= 0),
        created_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT,
        updated_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
        description TEXT DEFAULT '',
        created_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT,
        updated_at BIGINT NOT NULL DEFAULT FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);');

    await client.query(`
      INSERT INTO products (name, price, description)
      VALUES
        ('Ноутбук', 75000, 'Стартовый товар для проверки Redis-кэша'),
        ('Клавиатура', 4200, 'Механическая клавиатура для демонстрации CRUD')
      ON CONFLICT (name) DO NOTHING;
    `);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1);', [24001923]).catch(() => null);
    client.release();
  }
}

async function checkPostgres() {
  const result = await pool.query('SELECT 1 AS ok;');
  return result.rows[0].ok === 1;
}

function normalizeUserRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    first_name: row.first_name,
    last_name: row.last_name,
    age: Number(row.age),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at)
  };
}

function normalizeProductRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    price: Number(row.price),
    description: row.description || '',
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at)
  };
}

module.exports = {
  pool,
  initPostgres,
  checkPostgres,
  normalizeUserRow,
  normalizeProductRow
};
