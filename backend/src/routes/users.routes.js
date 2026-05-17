const express = require('express');
const config = require('../config');
const { pool, normalizeUserRow } = require('../db/postgres');
const { UserProfile, cleanProfile } = require('../models/UserProfile');
const { cacheMiddleware, saveToCache, invalidateUsersCache } = require('../middleware/cache');
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

function parseUserPayload(body, partial = false) {
  const errors = [];
  const payload = {};

  if (!partial || body.first_name !== undefined) {
    if (typeof body.first_name !== 'string' || body.first_name.trim().length === 0) {
      errors.push('first_name is required and must be a non-empty string');
    } else {
      payload.first_name = body.first_name.trim();
    }
  }

  if (!partial || body.last_name !== undefined) {
    if (typeof body.last_name !== 'string' || body.last_name.trim().length === 0) {
      errors.push('last_name is required and must be a non-empty string');
    } else {
      payload.last_name = body.last_name.trim();
    }
  }

  if (!partial || body.age !== undefined) {
    const age = Number(body.age);
    if (!Number.isInteger(age) || age < 0) {
      errors.push('age is required and must be a non-negative integer');
    } else {
      payload.age = age;
    }
  }

  if (errors.length > 0) {
    throw badRequest('Invalid user payload', errors);
  }

  return payload;
}

function sanitizeProfile(profile) {
  const safeProfile = profile && typeof profile === 'object' && !Array.isArray(profile) ? { ...profile } : {};
  delete safeProfile._id;
  delete safeProfile.id;
  delete safeProfile.__v;
  delete safeProfile.sqlUserId;
  delete safeProfile.created_at;
  delete safeProfile.updated_at;
  return safeProfile;
}

function buildProfilePayload(sqlUserId, profile = {}) {
  const now = unixNow();
  return {
    ...sanitizeProfile(profile),
    sqlUserId,
    sourceServer: config.serverId,
    created_at: now,
    updated_at: now
  };
}

function combineUser(user, profileDocument) {
  return {
    ...user,
    profile: cleanProfile(profileDocument)
  };
}

async function getCombinedUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id ASC;');
  const users = rows.map(normalizeUserRow);
  const ids = users.map((user) => user.id);

  const profiles = ids.length > 0
    ? await UserProfile.find({ sqlUserId: { $in: ids } }).exec()
    : [];
  const profileBySqlId = new Map(profiles.map((profile) => [profile.sqlUserId, profile]));

  return users.map((user) => combineUser(user, profileBySqlId.get(user.id)));
}

async function getCombinedUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1;', [id]);
  if (rows.length === 0) {
    throw notFound('User not found');
  }

  const user = normalizeUserRow(rows[0]);
  const profile = await UserProfile.findOne({ sqlUserId: id }).exec();
  return combineUser(user, profile);
}

router.post('/', asyncHandler(async (req, res) => {
  const payload = parseUserPayload(req.body);
  const client = await pool.connect();
  let insertedUser = null;

  try {
    await client.query('BEGIN;');
    const { rows } = await client.query(
      `INSERT INTO users (first_name, last_name, age)
       VALUES ($1, $2, $3)
       RETURNING *;`,
      [payload.first_name, payload.last_name, payload.age]
    );

    insertedUser = normalizeUserRow(rows[0]);
    const profile = await UserProfile.create(buildProfilePayload(insertedUser.id, req.body.profile));
    await client.query('COMMIT;');

    await invalidateUsersCache(insertedUser.id);

    return res.status(201).json({
      source: 'server',
      server: config.serverId,
      data: combineUser(insertedUser, profile)
    });
  } catch (error) {
    await client.query('ROLLBACK;').catch(() => null);
    if (insertedUser) {
      await UserProfile.deleteOne({ sqlUserId: insertedUser.id }).catch(() => null);
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.get(
  '/',
  cacheMiddleware(() => 'users:all', config.usersCacheTtlSeconds),
  asyncHandler(async (req, res) => {
    const data = await getCombinedUsers();
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
  cacheMiddleware((req) => `users:${req.params.id}`, config.usersCacheTtlSeconds),
  asyncHandler(async (req, res) => {
    const id = parsePositiveInteger(req.params.id);
    const data = await getCombinedUserById(id);
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
  const hasCoreFields = req.body.first_name !== undefined || req.body.last_name !== undefined || req.body.age !== undefined;
  const hasProfile = req.body.profile !== undefined;

  if (!hasCoreFields && !hasProfile) {
    throw badRequest('At least one user field or profile object is required');
  }

  const currentResult = await pool.query('SELECT * FROM users WHERE id = $1;', [id]);
  if (currentResult.rows.length === 0) {
    throw notFound('User not found');
  }

  const current = normalizeUserRow(currentResult.rows[0]);
  const payload = hasCoreFields ? parseUserPayload(req.body, true) : {};
  const now = unixNow();

  const nextUser = {
    first_name: payload.first_name !== undefined ? payload.first_name : current.first_name,
    last_name: payload.last_name !== undefined ? payload.last_name : current.last_name,
    age: payload.age !== undefined ? payload.age : current.age
  };

  const { rows } = await pool.query(
    `UPDATE users
     SET first_name = $1,
         last_name = $2,
         age = $3,
         updated_at = $4
     WHERE id = $5
     RETURNING *;`,
    [nextUser.first_name, nextUser.last_name, nextUser.age, now, id]
  );

  let profile;
  if (hasProfile) {
    profile = await UserProfile.findOneAndUpdate(
      { sqlUserId: id },
      {
        $set: {
          ...sanitizeProfile(req.body.profile),
          sourceServer: config.serverId,
          updated_at: now
        },
        $setOnInsert: {
          sqlUserId: id,
          created_at: now
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();
  } else {
    profile = await UserProfile.findOne({ sqlUserId: id }).exec();
  }

  await invalidateUsersCache(id);

  return res.json({
    source: 'server',
    server: config.serverId,
    data: combineUser(normalizeUserRow(rows[0]), profile)
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *;', [id]);

  if (rows.length === 0) {
    throw notFound('User not found');
  }

  const profile = await UserProfile.findOneAndDelete({ sqlUserId: id }).exec();
  await invalidateUsersCache(id);

  return res.json({
    source: 'server',
    server: config.serverId,
    message: 'User deleted from PostgreSQL and MongoDB',
    data: combineUser(normalizeUserRow(rows[0]), profile)
  });
}));

router.use((error, req, res, next) => {
  if (error && error.code === 11000) {
    return next(new HttpError(409, 'MongoDB document already exists', error.keyValue));
  }
  return next(error);
});

module.exports = router;
