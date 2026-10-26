const { Kafka, logLevel } = require('kafkajs');

class KafkaOutboxPublisher {
  constructor({ brokers, topic = 'order-created' }) {
    this.topic = topic;
    const brokerList = Array.isArray(brokers)
      ? brokers
      : String(brokers || 'localhost:9092').split(',').map((s) => s.trim());

    this.kafka = new Kafka({
      clientId: 'order-service-producer',
      brokers: brokerList,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 8 }
    });
    this.producer = this.kafka.producer();
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publish(key, eventPayload) {
    await this.connect();
    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: String(key),
          value: JSON.stringify(eventPayload)
        }
      ]
    });
  }

  async close() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

class InMemoryEventPublisher {
  constructor(eventEmitter, topic = 'order-created') {
    this.eventEmitter = eventEmitter;
    this.topic = topic;
    this.publishedMessages = [];
  }

  async connect() {}

  async publish(key, eventPayload) {
    const msg = { key: String(key), value: JSON.stringify(eventPayload) };
    this.publishedMessages.push(msg);
    if (this.eventEmitter) {
      this.eventEmitter.emit(this.topic, msg);
    }
  }

  async close() {}
}

class OutboxWorker {
  constructor(orderRepository, publisher, intervalMs = 2000) {
    this.orderRepository = orderRepository;
    this.publisher = publisher;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.flushing = false;
  }

  start() {
    this.timer = setInterval(() => {
      this.flushOnce().catch((err) => {
        console.warn('[order-service][outbox] Background flush retry scheduled:', err.message);
      });
    }, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  async flushOnce() {
    if (this.flushing) return 0;
    this.flushing = true;
    let count = 0;
    try {
      const pending = await this.orderRepository.fetchPendingOutboxEvents(20);
      for (const evt of pending) {
        await this.publisher.publish(evt.aggregate_id, evt.payload);
        await this.orderRepository.markOutboxPublished(evt.event_id);
        count++;
      }
      return count;
    } finally {
      this.flushing = false;
    }
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.publisher.close();
  }
}

module.exports = { KafkaOutboxPublisher, InMemoryEventPublisher, OutboxWorker };

