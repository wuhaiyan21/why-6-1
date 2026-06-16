const { createClient } = require('redis');

let client;

async function connectRedis() {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = process.env.REDIS_PORT || 6379;

  client = createClient({
    url: `redis://${redisHost}:${redisPort}`,
  });

  client.on('error', (err) => console.error('Redis Client Error', err));
  client.on('connect', () => console.log('Redis connected successfully'));

  await client.connect();
  return client;
}

function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
}

module.exports = { connectRedis, getRedisClient };
