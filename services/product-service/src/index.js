require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const { MongoProductRepository, InMemoryProductRepository } = require('./infrastructure/product.repository');
const { ProductUseCase } = require('./application/product.usecase');
const { createProductGrpcServer } = require('./presentation/grpc.server');

async function startProductService(options = {}) {
  const dbMode = options.dbMode || process.env.DB_MODE || 'mongo';
  const port = options.port ?? process.env.PRODUCT_GRPC_PORT ?? '50053';
  const host = options.host || '0.0.0.0';

  const repository = dbMode === 'memory'
    ? new InMemoryProductRepository()
    : new MongoProductRepository(options.mongoUri || process.env.PRODUCT_MONGO_URI || 'mongodb://localhost:27018/product_db');

  for (let i = 1; i <= 10; i++) {
    try {
      await repository.init();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.warn(`[product-service] Waiting for database (${i}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const useCase = new ProductUseCase(repository);
  const server = createProductGrpcServer(useCase, repository, options.protoDir);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) return reject(err);
      resolve(actualPort);
    });
  });

  console.log(`[product-service] gRPC server listening on ${host}:${boundPort} (dbMode=${dbMode})`);

  return {
    server,
    port: boundPort,
    repository,
    stop: async () => {
      await new Promise((resolve) => server.tryShutdown(resolve));
      await repository.close();
    }
  };
}

if (require.main === module) {
  startProductService().catch((err) => {
    console.error('[product-service] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startProductService };
