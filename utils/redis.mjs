// utils/redis.mjs
import redis from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    // Création du client Redis v2.x
    this.client = redis.createClient(process.env.REDIS_URL || 'redis://localhost:6379');

    // Affiche les erreurs du client
    this.client.on('error', (err) => console.error('Redis Client Error', err));

    // Promisify pour avoir des fonctions async/await
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  isAlive() {
    // En v2/v3 on vérifie `connected`
    return this.client.connected;
  }

  async get(key) {
    return this.getAsync(key);
  }

  async set(key, value, duration) {
    if (duration) {
      // 'EX' = expire en secondes
      return this.setAsync(key, value, 'EX', duration);
    }
    return this.setAsync(key, value);
  }

  async del(key) {
    return this.delAsync(key);
  }
}

// Exporte l'instance unique demandée
const redisClient = new RedisClient();
export default redisClient;
