const crypto = require('crypto');

function createLoggerMiddleware({ silent = false } = {}) {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startNs = process.hrtime.bigint();

    res.on('finish', () => {
      if (silent) return;
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const userTag = req.user ? `${req.user.uid}(${req.user.role})` : 'anonymous';
      console.log(
        `[api-gateway] ${new Date().toISOString()} [${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(2)}ms) user=${userTag} ip=${req.ip}`
      );
    });

    next();
  };
}

module.exports = { createLoggerMiddleware };

