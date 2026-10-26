require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const { PostgresUserRepository, InMemoryUserRepository } = require('./infrastructure/user.repository');
const { AuthUseCase } = require('./application/auth.usecase');
const { createAuthGrpcServer } = require('./presentation/grpc.server');

async function startAuthService(options = {}) {
  const dbMode = options.dbMode || process.env.DB_MODE || 'postgres';
  const port = options.port ?? process.env.AUTH_GRPC_PORT ?? '50051';
  const host = options.host || '0.0.0.0';

  const repository = dbMode === 'memory'
    ? new InMemoryUserRepository()
    : new PostgresUserRepository(options.databaseUrl || process.env.AUTH_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/auth_db');

  for (let i = 1; i <= 10; i++) {
    try {
      await repository.init();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.warn(`[auth-service] Waiting for database (${i}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const authUseCase = new AuthUseCase(repository, {
    jwtSecret: options.jwtSecret || process.env.JWT_SECRET,
    jwtExpiresIn: options.jwtExpiresIn || process.env.JWT_EXPIRES_IN || 3600
  });

  const server = createAuthGrpcServer(authUseCase, repository, options.protoDir);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) return reject(err);
      resolve(actualPort);
    });
  });

  console.log(`[auth-service] gRPC server listening on ${host}:${boundPort} (dbMode=${dbMode})`);

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
  startAuthService().catch((err) => {
    console.error('[auth-service] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startAuthService };
