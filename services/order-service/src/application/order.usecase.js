const { DomainError, DiscountPolicy, Order } = require('../domain/order.entity');

class OrderUseCase {
  constructor(orderRepository, downstreamClients, outboxWorker) {
    this.orderRepository = orderRepository;
    this.downstreamClients = downstreamClients;
    this.outboxWorker = outboxWorker;
  }

  async createOrder({ uid, items }) {
    // 1. Validate & consolidate items
    const normalizedItems = Order.normalizeAndValidateInput({ uid, items });

    // 2. Synchronous gRPC -> Customer Service: verify customer exists & retrieve membership score
    const customerScore = await this.downstreamClients.getCustomerScore(Number(uid));
    const score = Number(customerScore.score) || 0;

    // 3. Synchronous gRPC -> Product Service: check stock & atomically reserve inventory
    const reservation = await this.downstreamClients.reserveInventory(normalizedItems);
    const reservedItems = reservation.items || [];

    // 4. Calculate subtotal, membership discount, and final total_amount
    const subtotal = reservedItems.reduce(
      (sum, item) => sum + Number(item.qty) * Number(item.unit_price),
      0
    );
    const discount = DiscountPolicy.calculate(subtotal, score);
    const totalAmount = Number(Math.max(0, subtotal - discount).toFixed(2));

    // 5. Persist Order + OrderDetail + OutboxEvent in single ACID transaction
    let createdOrder;
    try {
      createdOrder = await this.orderRepository.createOrderWithOutbox({
        uid: Number(uid),
        discount,
        total_amount: totalAmount,
        items: reservedItems.map((r) => ({
          pid: r.pid,
          qty: r.qty,
          unit_price: r.unit_price
        }))
      });
    } catch (dbErr) {
      // Compensating action: release reserved inventory back to Product Service
      try {
        await this.downstreamClients.releaseInventory(normalizedItems);
      } catch (releaseErr) {
        console.error('[order-service] Compensation ReleaseInventory failed:', releaseErr.message);
      }
      throw dbErr;
    }

    // 6. Trigger immediate Outbox publish to Kafka (if Kafka is busy, background worker retries)
    if (this.outboxWorker) {
      try {
        await this.outboxWorker.flushOnce();
      } catch (pubErr) {
        console.warn('[order-service] Immediate Kafka publish deferred to Outbox retry:', pubErr.message);
      }
    }

    return createdOrder;
  }

  async getOrder({ oid }) {
    if (!oid || Number(oid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid order oid');
    }
    const order = await this.orderRepository.findByOid(Number(oid));
    if (!order) {
      throw new DomainError('NOT_FOUND', `Order oid=${oid} not found`);
    }
    return order;
  }

  async listOrders({ uid, is_admin }) {
    const items = await this.orderRepository.listOrders({
      uid: Number(uid),
      is_admin: Boolean(is_admin)
    });
    return { items };
  }
}

module.exports = { OrderUseCase };

