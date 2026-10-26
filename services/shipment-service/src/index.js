require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const { MongoShipmentRepository, InMemoryShipmentRepository } = require('./infrastructure/shipment.repository');
const { KafkaOrderCreatedConsumer, InMemoryOrderCreatedConsumer } = require('./infrastructure/kafka.consumer');
const { ShipmentUseCase } = require('./application/shipment.usecase');
const { createShipmentGrpcServer } = require('./presentation/grpc.server');

async function startConsumerWithRetry(consumer, retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await consumer.start();
      console.log('[shipment-service] Event consumer connected and listening');
      return;
    } catch (err) {
      console.warn(`[shipment-service] Consumer connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function startShipmentService(options = {}) {
  const dbMode = options.dbMode || process.env.DB_MODE || 'mongo';
  const brokerMode = options.brokerMode || process.env.BROKER_MODE || (dbMode === 'memory' ? 'memory' : 'kafka');
  const port = options.port ?? process.env.SHIPMENT_GRPC_PORT ?? '50055';
  const host = options.host || '0.0.0.0';
  const topic = options.kafkaTopic || process.env.KAFKA_ORDER_TOPIC || 'order-created';

  const repository = dbMode === 'memory'
    ? new InMemoryShipmentRepository()
    : new MongoShipmentRepository(options.mongoUri || process.env.SHIPMENT_MONGO_URI || 'mongodb://localhost:27019/shipment_db');

  for (let i = 1; i <= 10; i++) {
    try {
      await repository.init();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.warn(`[shipment-service] Waiting for database (${i}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const useCase = new ShipmentUseCase(repository);

  const consumer = brokerMode === 'memory'
    ? new InMemoryOrderCreatedConsumer({ eventEmitter: options.eventEmitter, topic, shipmentUseCase: useCase })
    : new KafkaOrderCreatedConsumer({
        brokers: options.kafkaBrokers || process.env.KAFKA_BROKERS || 'localhost:9092',
        topic,
        shipmentUseCase: useCase
      });

  if (brokerMode === 'memory') {
    await consumer.start();
  } else {
    // Connect asynchronously with retries so gRPC server comes up immediately
    startConsumerWithRetry(consumer).catch((err) => {
      console.error('[shipment-service] Exhausted Kafka consumer retries:', err.message);
    });
  }

  const server = createShipmentGrpcServer(useCase, repository, options.protoDir);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, actualPort) => {
      if (err) return reject(err);
      resolve(actualPort);
    });
  });

  console.log(`[shipment-service] gRPC server listening on ${host}:${boundPort} (dbMode=${dbMode}, brokerMode=${brokerMode})`);

  return {
    server,
    port: boundPort,
    repository,
    useCase,
    consumer,
    stop: async () => {
      await consumer.stop();
      await new Promise((resolve) => server.tryShutdown(resolve));
      await repository.close();
    }
  };
}

if (require.main === module) {
  startShipmentService().catch((err) => {
    console.error('[shipment-service] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startShipmentService };
