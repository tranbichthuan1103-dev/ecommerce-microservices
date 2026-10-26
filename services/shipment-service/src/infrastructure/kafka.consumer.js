const { Kafka, logLevel } = require('kafkajs');

class KafkaOrderCreatedConsumer {
  constructor({ brokers, topic = 'order-created', groupId = 'shipment-service-group', shipmentUseCase }) {
    this.topic = topic;
    this.shipmentUseCase = shipmentUseCase;
    const brokerList = Array.isArray(brokers)
      ? brokers
      : String(brokers || 'localhost:9092').split(',').map((s) => s.trim());

    this.kafka = new Kafka({
      clientId: 'shipment-service-consumer',
      brokers: brokerList,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 500, retries: 10 }
    });
    this.consumer = this.kafka.consumer({ groupId });
    this.running = false;
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    this.running = true;

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value ? message.value.toString() : '';
        console.log(`[shipment-service][kafka] Received message from ${topic}[${partition}]`);
        await this.shipmentUseCase.handleOrderCreatedEvent(raw);
      }
    });
  }

  async stop() {
    if (this.running) {
      await this.consumer.disconnect();
      this.running = false;
    }
  }
}

class InMemoryOrderCreatedConsumer {
  constructor({ eventEmitter, topic = 'order-created', shipmentUseCase }) {
    this.eventEmitter = eventEmitter;
    this.topic = topic;
    this.shipmentUseCase = shipmentUseCase;
    this.listener = null;
  }

  async start() {
    if (!this.eventEmitter) return;
    this.listener = async (msg) => {
      const raw = msg && msg.value !== undefined ? msg.value : msg;
      await this.shipmentUseCase.handleOrderCreatedEvent(raw);
    };
    this.eventEmitter.on(this.topic, this.listener);
  }

  async stop() {
    if (this.eventEmitter && this.listener) {
      this.eventEmitter.off(this.topic, this.listener);
      this.listener = null;
    }
  }
}

module.exports = { KafkaOrderCreatedConsumer, InMemoryOrderCreatedConsumer };

