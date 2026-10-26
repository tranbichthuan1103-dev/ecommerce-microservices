const crypto = require('crypto');
const { Pool } = require('pg');
const { Order } = require('../domain/order.entity');

class PostgresOrderRepository {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        oid SERIAL PRIMARY KEY,
        uid INT NOT NULL,
        discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
        createat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS order_details (
        oid INT NOT NULL REFERENCES orders(oid) ON DELETE CASCADE,
        pid INT NOT NULL,
        qty INT NOT NULL CHECK (qty > 0),
        unit_price NUMERIC(10, 2) NOT NULL,
        PRIMARY KEY (oid, pid)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        event_id UUID PRIMARY KEY,
        aggregate_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP
      );
    `);

    await this.pool.query(`
      SELECT setval(
        pg_get_serial_sequence('orders', 'oid'),
        GREATEST((SELECT COALESCE(MAX(oid), 1000) FROM orders), 1000)
      );
    `);
  }

  async createOrderWithOutbox({ uid, discount, total_amount, items }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `INSERT INTO orders (uid, discount, total_amount, status)
         VALUES ($1, $2, $3, 'CREATED')
         RETURNING oid, uid, discount, total_amount, status, createat`,
        [uid, discount, total_amount]
      );
      const orderRow = orderRes.rows[0];
      const oid = orderRow.oid;

      for (const item of items) {
        await client.query(
          `INSERT INTO order_details (oid, pid, qty, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [oid, item.pid, item.qty, item.unit_price]
        );
      }

      const eventId = crypto.randomUUID();
      const eventPayload = {
        eventId,
        eventType: 'OrderCreated',
        timestamp: new Date().toISOString(),
        data: {
          oid,
          uid: Number(uid),
          discount: Number(discount),
          total_amount: Number(total_amount),
          items: items.map((i) => ({
            pid: Number(i.pid),
            qty: Number(i.qty),
            unit_price: Number(i.unit_price)
          }))
        }
      };

      await client.query(
        `INSERT INTO outbox_events (event_id, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, 'OrderCreated', $3, 'PENDING')`,
        [eventId, oid, JSON.stringify(eventPayload)]
      );

      await client.query('COMMIT');

      return new Order({
        oid,
        uid: orderRow.uid,
        discount: Number(orderRow.discount),
        total_amount: Number(orderRow.total_amount),
        items,
        status: orderRow.status,
        created_at: new Date(orderRow.createat).toISOString()
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findByOid(oid) {
    const orderRes = await this.pool.query(
      `SELECT oid, uid, discount, total_amount, status, createat FROM orders WHERE oid = $1`,
      [Number(oid)]
    );
    if (!orderRes.rows[0]) return null;
    const o = orderRes.rows[0];
    const detailRes = await this.pool.query(
      `SELECT pid, qty, unit_price FROM order_details WHERE oid = $1 ORDER BY pid ASC`,
      [Number(oid)]
    );
    return new Order({
      oid: o.oid,
      uid: o.uid,
      discount: Number(o.discount),
      total_amount: Number(o.total_amount),
      items: detailRes.rows,
      status: o.status,
      created_at: new Date(o.createat).toISOString()
    });
  }

  async listOrders({ uid, is_admin }) {
    const query = is_admin
      ? `SELECT oid FROM orders ORDER BY oid DESC`
      : `SELECT oid FROM orders WHERE uid = $1 ORDER BY oid DESC`;
    const params = is_admin ? [] : [Number(uid)];
    const res = await this.pool.query(query, params);
    const orders = [];
    for (const row of res.rows) {
      const full = await this.findByOid(row.oid);
      if (full) orders.push(full);
    }
    return orders;
  }

  async fetchPendingOutboxEvents(limit = 20) {
    const res = await this.pool.query(
      `SELECT event_id, aggregate_id, event_type, payload
       FROM outbox_events
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map((r) => ({
      event_id: r.event_id,
      aggregate_id: r.aggregate_id,
      event_type: r.event_type,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
    }));
  }

  async markOutboxPublished(eventId) {
    await this.pool.query(
      `UPDATE outbox_events SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE event_id = $1`,
      [eventId]
    );
  }

  async checkHealth() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close() {
    await this.pool.end();
  }
}

class InMemoryOrderRepository {
  constructor() {
    this.orders = [];
    this.outbox = [];
    this.nextOid = 1001;
  }

  async init() {
    this.orders = [];
    this.outbox = [];
    this.nextOid = 1001;
  }

  async createOrderWithOutbox({ uid, discount, total_amount, items }) {
    const oid = this.nextOid++;
    const createdAt = new Date().toISOString();
    const order = new Order({
      oid,
      uid,
      discount,
      total_amount,
      items,
      status: 'CREATED',
      created_at: createdAt
    });
    this.orders.push(order);

    const eventId = crypto.randomUUID();
    const eventPayload = {
      eventId,
      eventType: 'OrderCreated',
      timestamp: createdAt,
      data: {
        oid,
        uid: Number(uid),
        discount: Number(discount),
        total_amount: Number(total_amount),
        items: order.items
      }
    };
    this.outbox.push({
      event_id: eventId,
      aggregate_id: oid,
      event_type: 'OrderCreated',
      payload: eventPayload,
      status: 'PENDING',
      created_at: createdAt,
      published_at: null
    });

    return order;
  }

  async findByOid(oid) {
    return this.orders.find((o) => o.oid === Number(oid)) || null;
  }

  async listOrders({ uid, is_admin }) {
    const filtered = is_admin
      ? [...this.orders]
      : this.orders.filter((o) => o.uid === Number(uid));
    return filtered.sort((a, b) => b.oid - a.oid);
  }

  async fetchPendingOutboxEvents(limit = 20) {
    return this.outbox.filter((e) => e.status === 'PENDING').slice(0, limit);
  }

  async markOutboxPublished(eventId) {
    const found = this.outbox.find((e) => e.event_id === eventId);
    if (found) {
      found.status = 'PUBLISHED';
      found.published_at = new Date().toISOString();
    }
  }

  async checkHealth() {
    return true;
  }

  async close() {}
}

module.exports = { PostgresOrderRepository, InMemoryOrderRepository };

