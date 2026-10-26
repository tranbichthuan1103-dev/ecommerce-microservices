const { MongoClient } = require('mongodb');
const { Product } = require('../domain/product.entity');

const SEED_PRODUCTS = [
  { pid: 1, pname: 'Laptop Gaming Pro', price: 1500.00, quantity: 10 },
  { pid: 2, pname: 'Wireless Mouse', price: 25.00, quantity: 50 },
  { pid: 3, pname: 'Mechanical Keyboard', price: 100.00, quantity: 20 }
];

class MongoProductRepository {
  constructor(mongoUri) {
    this.client = new MongoClient(mongoUri);
    this.db = null;
    this.products = null;
    this.inventories = null;
    this.counters = null;
  }

  async init() {
    await this.client.connect();
    this.db = this.client.db();
    this.products = this.db.collection('products');
    this.inventories = this.db.collection('inventories');
    this.counters = this.db.collection('counters');

    await this.products.createIndex({ pid: 1 }, { unique: true });
    await this.inventories.createIndex({ pid: 1 }, { unique: true });

    const count = await this.products.countDocuments();
    if (count === 0) {
      for (const p of SEED_PRODUCTS) {
        await this.products.insertOne({ ...p });
        await this.inventories.insertOne({ pid: p.pid, quantity: p.quantity, updatedAt: new Date() });
      }
      await this.counters.updateOne(
        { _id: 'product_pid' },
        { $set: { seq: SEED_PRODUCTS.length } },
        { upsert: true }
      );
    } else {
      const maxDoc = await this.products.find().sort({ pid: -1 }).limit(1).toArray();
      const maxPid = maxDoc[0] ? maxDoc[0].pid : 0;
      await this.counters.updateOne(
        { _id: 'product_pid' },
        { $max: { seq: maxPid } },
        { upsert: true }
      );
    }
  }

  async _nextPid() {
    const res = await this.counters.findOneAndUpdate(
      { _id: 'product_pid' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const doc = res && res.seq !== undefined ? res : res.value;
    return doc.seq;
  }

  async findAll() {
    const docs = await this.products.find({}).sort({ pid: 1 }).toArray();
    return docs.map((d) => new Product(d));
  }

  async findByPid(pid) {
    const doc = await this.products.findOne({ pid: Number(pid) });
    return doc ? new Product(doc) : null;
  }

  async create({ pname, price, quantity }) {
    const pid = await this._nextPid();
    const doc = { pid, pname, price, quantity };
    await this.products.insertOne(doc);
    await this.inventories.updateOne(
      { pid },
      { $set: { pid, quantity, updatedAt: new Date() } },
      { upsert: true }
    );
    return new Product(doc);
  }

  async update(pid, { pname, price, quantity }) {
    await this.products.updateOne(
      { pid: Number(pid) },
      { $set: { pname, price, quantity } }
    );
    await this.inventories.updateOne(
      { pid: Number(pid) },
      { $set: { quantity, updatedAt: new Date() } },
      { upsert: true }
    );
    return this.findByPid(pid);
  }

  async delete(pid) {
    await this.products.deleteOne({ pid: Number(pid) });
    await this.inventories.deleteOne({ pid: Number(pid) });
  }

  async atomicDecrementStock(pid, qty) {
    const res = await this.products.findOneAndUpdate(
      { pid: Number(pid), quantity: { $gte: Number(qty) } },
      { $inc: { quantity: -Number(qty) } },
      { returnDocument: 'after' }
    );
    const updated = res && res.pid !== undefined ? res : (res ? res.value : null);
    if (!updated) return null;

    await this.inventories.updateOne(
      { pid: Number(pid) },
      { $set: { quantity: updated.quantity, updatedAt: new Date() } },
      { upsert: true }
    );
    return new Product(updated);
  }

  async atomicIncrementStock(pid, qty) {
    const res = await this.products.findOneAndUpdate(
      { pid: Number(pid) },
      { $inc: { quantity: Number(qty) } },
      { returnDocument: 'after' }
    );
    const updated = res && res.pid !== undefined ? res : (res ? res.value : null);
    if (updated) {
      await this.inventories.updateOne(
        { pid: Number(pid) },
        { $set: { quantity: updated.quantity, updatedAt: new Date() } },
        { upsert: true }
      );
    }
    return updated ? new Product(updated) : null;
  }

  async checkHealth() {
    await this.db.command({ ping: 1 });
    return true;
  }

  async close() {
    await this.client.close();
  }
}

class InMemoryProductRepository {
  constructor() {
    this.items = [];
    this.inventories = new Map();
    this.nextPid = 4;
  }

  async init() {
    this.items = SEED_PRODUCTS.map((p) => new Product(p));
    this.inventories = new Map(SEED_PRODUCTS.map((p) => [p.pid, { pid: p.pid, quantity: p.quantity }]));
    this.nextPid = SEED_PRODUCTS.length + 1;
  }

  async findAll() {
    return this.items.map((p) => new Product(p));
  }

  async findByPid(pid) {
    const found = this.items.find((p) => p.pid === Number(pid));
    return found ? new Product(found) : null;
  }

  async create({ pname, price, quantity }) {
    const created = new Product({ pid: this.nextPid++, pname, price, quantity });
    this.items.push(created);
    this.inventories.set(created.pid, { pid: created.pid, quantity: created.quantity });
    return new Product(created);
  }

  async update(pid, { pname, price, quantity }) {
    const idx = this.items.findIndex((p) => p.pid === Number(pid));
    if (idx >= 0) {
      this.items[idx] = new Product({ pid: Number(pid), pname, price, quantity });
      this.inventories.set(Number(pid), { pid: Number(pid), quantity });
      return new Product(this.items[idx]);
    }
    return null;
  }

  async delete(pid) {
    this.items = this.items.filter((p) => p.pid !== Number(pid));
    this.inventories.delete(Number(pid));
  }

  async atomicDecrementStock(pid, qty) {
    const target = this.items.find((p) => p.pid === Number(pid));
    if (!target || target.quantity < Number(qty)) {
      return null;
    }
    target.quantity -= Number(qty);
    this.inventories.set(target.pid, { pid: target.pid, quantity: target.quantity });
    return new Product(target);
  }

  async atomicIncrementStock(pid, qty) {
    const target = this.items.find((p) => p.pid === Number(pid));
    if (!target) return null;
    target.quantity += Number(qty);
    this.inventories.set(target.pid, { pid: target.pid, quantity: target.quantity });
    return new Product(target);
  }

  async checkHealth() {
    return true;
  }

  async close() {}
}

module.exports = { MongoProductRepository, InMemoryProductRepository };

