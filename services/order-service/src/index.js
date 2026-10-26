require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const { PostgresOrderRepository, InMemoryOrderRepository } = require('./infrastructure/order.repository');
const { createDownstreamGrpcClients } = require('./infrastructure/grpc.clients');
const { KafkaOutboxPublisher, InMemoryEventPublisher, OutboxWorker } = require('./infrastructure/outbox.publisher');
const { OrderUseCase } = require('./application/order.usecase');
const { createOrderGrpcServer } = require('./presentation/grpc.server');

async function startOrderService(options = {}) {
  const dbMode = options.dbMode || process.env.DB_MODE || 'postgres';
  const brokerMode = options.brokerMode || process.env.BROKER_MODE || (dbMode === 'memory' ? 'memory' : 'kafka');
  const port = options.port ?? process.env.ORDER_GRPC_PORT ?? '50054';
  const host = options.host || '0.0.0.0';
  const topic = options.kafkaTopic || process.env.KAFKA_ORDER_TOPIC || 'order-created';

  const repository = dbMode === 'memory'
    ? new InMemoryOrderRepository()
    : new PostgresOrderRepository(options.databaseUrl || process.env.ORDER_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5435/order_db');

  for (let i = 1; i <= 10; i++) {
    try {
      await repository.init();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.warn(`[order-service] Waiting for database (${i}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const downstreamClients = createDownstreamGrpcClients({
    customerServiceUrl: options.customerServiceUrl || process.env.CUSTOMER_SERVICE_URL || 'localhost:50052',
    productServiceUrl: options.productServiceUrl || process.env.PRODUCT_SERVICE_URL || 'localhost:50053',
    protoDir: options.protoDir
  });

  const publisher = brokerMode === 'memory'
    ? new InMemoryEventPublisher(options.eventEmitter, topic)
    : new KafkaOutboxPublisher({
        brokers: options.kafkaBrokers || process.env.KAFKA_BROKERS || 'localhost:9092',
        topic
      });

  const outboxWorker = new OutboxWorker(repository, publisher, options.outboxIntervalMs || 2000);
  outboxWorker.start();

  const useCase = new OrderUseCase(repository, downstreamClients, outboxWorker);
  const server = createOrderGrpcServer(useCase, repository, options.protoDir, publisher);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) return reject(err);
      resolve(actualPort);
    });
  });

  console.log(`[order-service] gRPC server listening on ${host}:${boundPort} (dbMode=${dbMode}, brokerMode=${brokerMode})`);

  return {
    server,
    port: boundPort,
    repository,
    publisher,
    outboxWorker,
    stop: async () => {
      await outboxWorker.stop();
      downstreamClients.close();
      await new Promise((resolve) => server.tryShutdown(resolve));
      await repository.close();
    }
  };
}

if (require.main === module) {
  startOrderService().catch((err) => {
    console.error('[order-service] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startOrderService };
