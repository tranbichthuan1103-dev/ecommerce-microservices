require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { IoRedisStore, InMemoryRedisStore } = require('./infrastructure/redis.client');
const { createGatewayGrpcClients } = require('./infrastructure/grpc.clients');
const { createLoggerMiddleware } = require('./middlewares/logger.middleware');
const { createRateLimitMiddleware } = require('./middlewares/rateLimit.middleware');
const { createAuthMiddlewares } = require('./middlewares/auth.middleware');
const { createApiRouter } = require('./routes/api.routes');

async function startApiGateway(options = {}) {
  const redisMode = options.redisMode || process.env.REDIS_MODE || 'redis';
  const port = options.port ?? process.env.GATEWAY_PORT ?? 3000;
  const host = options.host || '0.0.0.0';

  const redisStore = redisMode === 'memory'
    ? new InMemoryRedisStore()
    : new IoRedisStore(options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

  const grpcClients = createGatewayGrpcClients({
    protoDir: options.protoDir,
    authServiceUrl: options.authServiceUrl,
    customerServiceUrl: options.customerServiceUrl,
    productServiceUrl: options.productServiceUrl,
    orderServiceUrl: options.orderServiceUrl,
    shipmentServiceUrl: options.shipmentServiceUrl
  });

  const authMiddlewares = createAuthMiddlewares(redisStore, grpcClients, {
    jwtSecret: options.jwtSecret || process.env.JWT_SECRET
  });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createLoggerMiddleware({ silent: Boolean(options.silentLogs) }));
  app.use(
    createRateLimitMiddleware(redisStore, {
      windowSec: Number(options.rateLimitWindowSec || process.env.RATE_LIMIT_WINDOW_SEC || 60),
      maxRequests: Number(options.rateLimitMaxRequests || process.env.RATE_LIMIT_MAX_REQUESTS || 100)
    })
  );

  app.use(
    '/api',
    createApiRouter({
      grpcClients,
      redisStore,
      authMiddlewares,
      cacheTtlSec: Number(options.cacheTtlSec || process.env.CACHE_TTL_SEC || 60)
    })
  );

  // 404 fallback
  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} not found` });
  });

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(port, host, () => resolve(srv));
    srv.on('error', reject);
  });

  const actualPort = server.address().port;
  console.log(`[api-gateway] HTTP REST server listening on http://${host}:${actualPort} (redisMode=${redisMode})`);

  return {
    app,
    server,
    port: actualPort,
    redisStore,
    grpcClients,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      grpcClients.closeAll();
      await redisStore.close();
    }
  };
}

if (require.main === module) {
  startApiGateway().catch((err) => {
    console.error('[api-gateway] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startApiGateway };

