function createCacheMiddleware(redisStore, keyBuilder, ttlSec = 60) {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `cache:${keyBuilder(req)}`;
    try {
      const cached = await redisStore.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(JSON.parse(cached));
      }
    } catch (err) {
      console.warn('[api-gateway][cache] Redis read error:', err.message);
    }

    res.setHeader('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        redisStore.setEx(cacheKey, ttlSec, JSON.stringify(body)).catch((err) => {
          console.warn('[api-gateway][cache] Redis write error:', err.message);
        });
      }
      return originalJson(body);
    };

    return next();
  };
}

module.exports = { createCacheMiddleware };

