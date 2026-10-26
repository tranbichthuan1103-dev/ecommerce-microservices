const Redis = require('ioredis');

class IoRedisStore {
  constructor(redisUrl) {
    this.client = new Redis(redisUrl || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true
    });
  }

  async get(key) {
    return this.client.get(key);
  }

  async setEx(key, ttlSec, value) {
    await this.client.set(key, value, 'EX', Math.max(1, Number(ttlSec) || 60));
  }

  async del(key) {
    await this.client.del(key);
  }

  async delByPrefix(prefix) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async incrWithWindow(key, windowSec) {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSec);
    }
    const ttl = await this.client.ttl(key);
    return { count, ttl: ttl > 0 ? ttl : windowSec };
  }

  async ping() {
    const res = await this.client.ping();
    return res === 'PONG';
  }

  async close() {
    await this.client.quit();
  }
}

class InMemoryRedisStore {
  constructor() {
    this.map = new Map();
  }

  _cleanupExpired(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  async get(key) {
    const entry = this._cleanupExpired(key);
    return entry ? entry.value : null;
  }

  async setEx(key, ttlSec, value) {
    const ttlMs = Math.max(1, Number(ttlSec) || 60) * 1000;
    this.map.set(key, {
      value: String(value),
      expiresAt: Date.now() + ttlMs
    });
  }

  async del(key) {
    this.map.delete(key);
  }

  async delByPrefix(prefix) {
    for (const k of Array.from(this.map.keys())) {
      if (k.startsWith(prefix)) {
        this.map.delete(k);
      }
    }
  }

  async incrWithWindow(key, windowSec) {
    const existing = this._cleanupExpired(key);
    if (!existing) {
      const expiresAt = Date.now() + windowSec * 1000;
      this.map.set(key, { value: '1', expiresAt });
      return { count: 1, ttl: windowSec };
    }
    const nextCount = Number(existing.value) + 1;
    existing.value = String(nextCount);
    const remainingSec = Math.max(1, Math.ceil((existing.expiresAt - Date.now()) / 1000));
    return { count: nextCount, ttl: remainingSec };
  }

  async ping() {
    return true;
  }

  async close() {
    this.map.clear();
  }
}

module.exports = { IoRedisStore, InMemoryRedisStore };

