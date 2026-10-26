function createRateLimitMiddleware(redisStore, { windowSec = 60, maxRequests = 100 } = {}) {
  return async (req, res, next) => {
    // Exempt health check from rate limit
    if (req.path === '/api/health') {
      return next();
    }

    try {
      const clientIdentifier = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `ratelimit:${clientIdentifier}`;
      const { count, ttl } = await redisStore.incrWithWindow(key, windowSec);

      const remaining = Math.max(0, maxRequests - count);
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(ttl));

      if (count > maxRequests) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded (${maxRequests} requests per ${windowSec}s). Try again in ${ttl}s.`
        });
      }

      return next();
    } catch (err) {
      // Fail-open if Redis encounters transient error so API remains available, while logging warning
      console.warn('[api-gateway][ratelimit] Redis error, failing open:', err.message);
      return next();
    }
  };
}

module.exports = { createRateLimitMiddleware };

