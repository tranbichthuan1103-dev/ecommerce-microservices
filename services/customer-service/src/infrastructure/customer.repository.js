const { Pool } = require('pg');
const { Membership, Customer } = require('../domain/customer.entity');

const SEED_MEMBERSHIPS = [
  { mid: 1, mname: 'Bronze', score: 0 },
  { mid: 2, mname: 'Silver', score: 100 },
  { mid: 3, mname: 'Gold', score: 500 },
  { mid: 4, mname: 'Platinum', score: 1000 }
];

const SEED_CUSTOMERS = [
  { uid: 1, fullname: 'System Admin', mid: 4 },
  { uid: 2, fullname: 'Shipment Staff', mid: 1 },
  { uid: 3, fullname: 'Alice Nguyen', mid: 2 },
  { uid: 4, fullname: 'Bob Tran', mid: 3 }
];

class PostgresCustomerRepository {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        mid SERIAL PRIMARY KEY,
        mname VARCHAR(50) NOT NULL UNIQUE,
        score INT NOT NULL DEFAULT 0
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        uid INT PRIMARY KEY,
        fullname VARCHAR(100) NOT NULL,
        mid INT NOT NULL REFERENCES memberships(mid)
      );
    `);

    for (const m of SEED_MEMBERSHIPS) {
      await this.pool.query(
        `INSERT INTO memberships (mid, mname, score) VALUES ($1, $2, $3) ON CONFLICT (mid) DO NOTHING`,
        [m.mid, m.mname, m.score]
      );
    }

    await this.pool.query(`
      SELECT setval(pg_get_serial_sequence('memberships', 'mid'), GREATEST((SELECT COALESCE(MAX(mid), 1) FROM memberships), 4));
    `);

    for (const c of SEED_CUSTOMERS) {
      await this.pool.query(
        `INSERT INTO customers (uid, fullname, mid) VALUES ($1, $2, $3) ON CONFLICT (uid) DO NOTHING`,
        [c.uid, c.fullname, c.mid]
      );
    }
  }

  async findByUid(uid) {
    const res = await this.pool.query(
      `SELECT c.uid, c.fullname, c.mid, m.mname, m.score
       FROM customers c
       JOIN memberships m ON c.mid = m.mid
       WHERE c.uid = $1`,
      [uid]
    );
    return res.rows[0] ? new Customer(res.rows[0]) : null;
  }

  async createCustomer({ uid, fullname, mid }) {
    await this.pool.query(
      `INSERT INTO customers (uid, fullname, mid) VALUES ($1, $2, $3)
       ON CONFLICT (uid) DO NOTHING`,
      [uid, fullname, mid]
    );
    return this.findByUid(uid);
  }

  async updateCustomer({ uid, fullname, mid }) {
    await this.pool.query(
      `UPDATE customers SET fullname = $2, mid = $3 WHERE uid = $1`,
      [uid, fullname, mid]
    );
    return this.findByUid(uid);
  }

  async listMemberships() {
    const res = await this.pool.query(`SELECT mid, mname, score FROM memberships ORDER BY score ASC`);
    return res.rows.map((r) => new Membership(r));
  }

  async findMembershipById(mid) {
    const res = await this.pool.query(`SELECT mid, mname, score FROM memberships WHERE mid = $1`, [mid]);
    return res.rows[0] ? new Membership(res.rows[0]) : null;
  }

  async findMembershipByName(mname) {
    const res = await this.pool.query(`SELECT mid, mname, score FROM memberships WHERE LOWER(mname) = LOWER($1)`, [mname]);
    return res.rows[0] ? new Membership(res.rows[0]) : null;
  }

  async createMembership({ mname, score }) {
    const res = await this.pool.query(
      `INSERT INTO memberships (mname, score) VALUES ($1, $2) RETURNING mid, mname, score`,
      [mname, score]
    );
    return new Membership(res.rows[0]);
  }

  async updateMembership({ mid, mname, score }) {
    const res = await this.pool.query(
      `UPDATE memberships SET mname = $2, score = $3 WHERE mid = $1 RETURNING mid, mname, score`,
      [mid, mname, score]
    );
    return new Membership(res.rows[0]);
  }

  async checkHealth() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close() {
    await this.pool.end();
  }
}

class InMemoryCustomerRepository {
  constructor() {
    this.memberships = [];
    this.customers = [];
    this.nextMid = 5;
  }

  async init() {
    this.memberships = SEED_MEMBERSHIPS.map((m) => new Membership(m));
    this.customers = SEED_CUSTOMERS.map((c) => ({ ...c }));
    this.nextMid = 5;
  }

  _hydrate(c) {
    const m = this.memberships.find((x) => x.mid === c.mid) || { mname: 'Bronze', score: 0 };
    return new Customer({ ...c, mname: m.mname, score: m.score });
  }

  async findByUid(uid) {
    const found = this.customers.find((c) => c.uid === Number(uid));
    return found ? this._hydrate(found) : null;
  }

  async createCustomer({ uid, fullname, mid }) {
    const existing = this.customers.find((c) => c.uid === Number(uid));
    if (!existing) {
      this.customers.push({ uid: Number(uid), fullname, mid: Number(mid) });
    }
    return this.findByUid(uid);
  }

  async updateCustomer({ uid, fullname, mid }) {
    const target = this.customers.find((c) => c.uid === Number(uid));
    if (target) {
      target.fullname = fullname;
      target.mid = Number(mid);
    }
    return this.findByUid(uid);
  }

  async listMemberships() {
    return [...this.memberships].sort((a, b) => a.score - b.score);
  }

  async findMembershipById(mid) {
    return this.memberships.find((m) => m.mid === Number(mid)) || null;
  }

  async findMembershipByName(mname) {
    return this.memberships.find((m) => m.mname.toLowerCase() === mname.toLowerCase()) || null;
  }

  async createMembership({ mname, score }) {
    const created = new Membership({ mid: this.nextMid++, mname, score: Number(score) });
    this.memberships.push(created);
    return created;
  }

  async updateMembership({ mid, mname, score }) {
    const idx = this.memberships.findIndex((m) => m.mid === Number(mid));
    if (idx >= 0) {
      this.memberships[idx] = new Membership({ mid: Number(mid), mname, score: Number(score) });
      return this.memberships[idx];
    }
    return null;
  }

  async checkHealth() {
    return true;
  }

  async close() {}
}

module.exports = { PostgresCustomerRepository, InMemoryCustomerRepository };

