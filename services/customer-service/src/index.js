require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const { PostgresCustomerRepository, InMemoryCustomerRepository } = require('./infrastructure/customer.repository');
const { CustomerUseCase } = require('./application/customer.usecase');
const { createCustomerGrpcServer } = require('./presentation/grpc.server');

async function startCustomerService(options = {}) {
  const dbMode = options.dbMode || process.env.DB_MODE || 'postgres';
  const port = options.port ?? process.env.CUSTOMER_GRPC_PORT ?? '50052';
  const host = options.host || '0.0.0.0';

  const repository = dbMode === 'memory'
    ? new InMemoryCustomerRepository()
    : new PostgresCustomerRepository(options.databaseUrl || process.env.CUSTOMER_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/customer_db');

  for (let i = 1; i <= 10; i++) {
    try {
      await repository.init();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.warn(`[customer-service] Waiting for database (${i}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const useCase = new CustomerUseCase(repository);
  const server = createCustomerGrpcServer(useCase, repository, options.protoDir);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) return reject(err);
      resolve(actualPort);
    });
  });

  console.log(`[customer-service] gRPC server listening on ${host}:${boundPort} (dbMode=${dbMode})`);

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
  startCustomerService().catch((err) => {
    console.error('[customer-service] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startCustomerService };
