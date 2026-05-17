const express = require('express');
const config = require('../config');
const { pool, normalizeProductRow } = require('../db/postgres');
const { ProductDocument, cleanProductDocument } = require('../models/ProductDocument');
const { cacheMiddleware, saveToCache, invalidateProductsCache } = require('../middleware/cache');
const asyncHandler = require('../utils/asyncHandler');
const { unixNow } = require('../utils/time');
const { badRequest, notFound, HttpError } = require('../utils/errors');

const router = express.Router();

function parsePositiveInteger(value, fieldName = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseProductPayload(body, partial = false) {
  const errors = [];
  const payload = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push('name is required and must be a non-empty string');
    } else {
      payload.name = body.name.trim();
    }
  }

  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push('price is required and must be a non-negative number');
    } else {
      payload.price = price;
    }
  }

  if (!partial || body.description !== undefined) {
    if (body.description !== undefined && typeof body.description !== 'string') {
      errors.push('description must be a string');
    } else {
      payload.description = body.description || '';
    }
  }

  if (errors.length > 0) {
    throw badRequest('Invalid product payload', errors);
  }

  return payload;
}

function sanitizeProductDocument(document) {
  const safeDocument = document && typeof document === 'object' && !Array.isArray(document) ? { ...document } : {};
  delete safeDocument._id;
  delete safeDocument.id;
  delete safeDocument.__v;
  delete safeDocument.sqlProductId;
  delete safeDocument.created_at;
  delete safeDocument.updated_at;
  return safeDocument;
}

function buildProductDocumentPayload(sqlProductId, document = {}) {
  const now = unixNow();
  return {
    ...sanitizeProductDocument(document),
    sqlProductId,
    sourceServer: config.serverId,
    created_at: now,
    updated_at: now
  };
}

function combineProduct(product, productDocument) {
  return {
    ...product,
    document: cleanProductDocument(productDocument)
  };
}

async function getCombinedProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC;');
  const products = rows.map(normalizeProductRow);
  const ids = products.map((product) => product.id);

  const documents = ids.length > 0
    ? await ProductDocument.find({ sqlProductId: { $in: ids } }).exec()
    : [];
  const documentBySqlId = new Map(documents.map((document) => [document.sqlProductId, document]));

  return products.map((product) => combineProduct(product, documentBySqlId.get(product.id)));
}

async function getCombinedProductById(id) {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1;', [id]);
  if (rows.length === 0) {
    throw notFound('Product not found');
  }

  const product = normalizeProductRow(rows[0]);
  const document = await ProductDocument.findOne({ sqlProductId: id }).exec();
  return combineProduct(product, document);
}

router.post('/', asyncHandler(async (req, res) => {
  const payload = parseProductPayload(req.body);
  const client = await pool.connect();
  let insertedProduct = null;

  try {
    await client.query('BEGIN;');
    const { rows } = await client.query(
      `INSERT INTO products (name, price, description)
       VALUES ($1, $2, $3)
       RETURNING *;`,
      [payload.name, payload.price, payload.description]
    );

    insertedProduct = normalizeProductRow(rows[0]);
    const document = await ProductDocument.create(buildProductDocumentPayload(insertedProduct.id, req.body.document));
    await client.query('COMMIT;');

    await invalidateProductsCache(insertedProduct.id);

    return res.status(201).json({
      source: 'server',
      server: config.serverId,
      data: combineProduct(insertedProduct, document)
    });
  } catch (error) {
    await client.query('ROLLBACK;').catch(() => null);
    if (insertedProduct) {
      await ProductDocument.deleteOne({ sqlProductId: insertedProduct.id }).catch(() => null);
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.get(
  '/',
  cacheMiddleware(() => 'products:all', config.productsCacheTtlSeconds),
  asyncHandler(async (req, res) => {
    const data = await getCombinedProducts();
    await saveToCache(res.locals.cacheKey, data, res.locals.cacheTtlSeconds);
    return res.json({
      source: 'server',
      server: config.serverId,
      cacheKey: res.locals.cacheKey,
      data
    });
  })
);

router.get(
  '/:id',
  cacheMiddleware((req) => `products:${req.params.id}`, config.productsCacheTtlSeconds),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInteger(req.params.id);
    const data = await getCombinedProductById(id);
    await saveToCache(res.locals.cacheKey, data, res.locals.cacheTtlSeconds);
    return res.json({
      source: 'server',
      server: config.serverId,
      cacheKey: res.locals.cacheKey,
      data
    });
  })
);

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const hasCoreFields = req.body.name !== undefined || req.body.price !== undefined || req.body.description !== undefined;
  const hasDocument = req.body.document !== undefined;

  if (!hasCoreFields && !hasDocument) {
    throw badRequest('At least one product field or document object is required');
  }

  const currentResult = await pool.query('SELECT * FROM products WHERE id = $1;', [id]);
  if (currentResult.rows.length === 0) {
    throw notFound('Product not found');
  }

  const current = normalizeProductRow(currentResult.rows[0]);
  const payload = hasCoreFields ? parseProductPayload(req.body, true) : {};
  const now = unixNow();

  const nextProduct = {
    name: payload.name !== undefined ? payload.name : current.name,
    price: payload.price !== undefined ? payload.price : current.price,
    description: payload.description !== undefined ? payload.description : current.description
  };

  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1,
         price = $2,
         description = $3,
         updated_at = $4
     WHERE id = $5
     RETURNING *;`,
    [nextProduct.name, nextProduct.price, nextProduct.description, now, id]
  );

  let document;
  if (hasDocument) {
    document = await ProductDocument.findOneAndUpdate(
      { sqlProductId: id },
      {
        $set: {
          ...sanitizeProductDocument(req.body.document),
          sourceServer: config.serverId,
          updated_at: now
        },
        $setOnInsert: {
          sqlProductId: id,
          created_at: now
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();
  } else {
    document = await ProductDocument.findOne({ sqlProductId: id }).exec();
  }

  await invalidateProductsCache(id);

  return res.json({
    source: 'server',
    server: config.serverId,
    data: combineProduct(normalizeProductRow(rows[0]), document)
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const { rows } = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *;', [id]);

  if (rows.length === 0) {
    throw notFound('Product not found');
  }

  const document = await ProductDocument.findOneAndDelete({ sqlProductId: id }).exec();
  await invalidateProductsCache(id);

  return res.json({
    source: 'server',
    server: config.serverId,
    message: 'Product deleted from PostgreSQL and MongoDB',
    data: combineProduct(normalizeProductRow(rows[0]), document)
  });
}));

router.use((error, req, res, next) => {
  if (error && error.code === 11000) {
    return next(new HttpError(409, 'MongoDB document already exists', error.keyValue));
  }
  return next(error);
});

module.exports = router;
