const mongoose = require('mongoose');
const config = require('../config');

mongoose.set('strictQuery', true);

async function connectMongo() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000
  });
}

async function checkMongo() {
  if (mongoose.connection.readyState !== 1) return false;
  const result = await mongoose.connection.db.admin().ping();
  return result.ok === 1;
}

module.exports = {
  mongoose,
  connectMongo,
  checkMongo
};
