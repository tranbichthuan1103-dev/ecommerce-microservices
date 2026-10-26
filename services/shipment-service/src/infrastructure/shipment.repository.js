const { MongoClient } = require('mongodb');
const { Shipment } = require('../domain/shipment.entity');

class MongoShipmentRepository {
  constructor(mongoUri) {
    this.client = new MongoClient(mongoUri);
    this.db = null;
    this.shipments = null;
    this.trackings = null;
    this.counters = null;
  }

  async init() {
    await this.client.connect();
    this.db = this.client.db();
    this.shipments = this.db.collection('shipments');
    this.trackings = this.db.collection('trackings');
    this.counters = this.db.collection('counters');

    await this.shipments.createIndex({ shipid: 1 }, { unique: true });
    await this.shipments.createIndex({ oid: 1 }, { unique: true });
    await this.trackings.createIndex({ shipid: 1, timestamp: 1 });

    const maxDoc = await this.shipments.find().sort({ shipid: -1 }).limit(1).toArray();
    const maxId = maxDoc[0] ? maxDoc[0].shipid : 5000;
    await this.counters.updateOne(
      { _id: 'shipment_shipid' },
      { $max: { seq: Math.max(maxId, 5000) } },
      { upsert: true }
    );
  }

  async _nextShipId() {
    const res = await this.counters.findOneAndUpdate(
      { _id: 'shipment_shipid' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const doc = res && res.seq !== undefined ? res : res.value;
    return doc.seq;
  }

  async _hydrate(doc) {
    if (!doc) return null;
    const logs = await this.trackings.find({ shipid: doc.shipid }).sort({ timestamp: 1 }).toArray();
    return new Shipment({
      shipid: doc.shipid,
      oid: doc.oid,
      uid: doc.uid || 0,
      status: doc.status,
      tracking: logs.map((t) => ({
        status: t.status,
        note: t.note || '',
        timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp)
      }))
    });
  }

  async findByShipId(shipid) {
    const doc = await this.shipments.findOne({ shipid: Number(shipid) });
    return this._hydrate(doc);
  }

  async findByOid(oid) {
    const doc = await this.shipments.findOne({ oid: Number(oid) });
    return this._hydrate(doc);
  }

  async findAll() {
    const docs = await this.shipments.find({}).sort({ shipid: -1 }).toArray();
    const results = [];
    for (const d of docs) {
      results.push(await this._hydrate(d));
    }
    return results;
  }

  async createShipment({ oid, uid, status = 'PENDING', note = '' }) {
    const existing = await this.findByOid(oid);
    if (existing) return existing;

    const shipid = await this._nextShipId();
    const now = new Date();
    try {
      await this.shipments.insertOne({
        shipid,
        oid: Number(oid),
        uid: Number(uid) || 0,
        status,
        createdAt: now,
        updatedAt: now
      });
      await this.trackings.insertOne({
        shipid,
        oid: Number(oid),
        status,
        note,
        timestamp: now
      });
      return this.findByShipId(shipid);
    } catch (err) {
      // Handle concurrent duplicate key on oid gracefully
      if (err && err.code === 11000) {
        return this.findByOid(oid);
      }
      throw err;
    }
  }

  async updateStatus(shipid, status, note = '') {
    const now = new Date();
    const doc = await this.shipments.findOne({ shipid: Number(shipid) });
    if (!doc) return null;

    await this.shipments.updateOne(
      { shipid: Number(shipid) },
      { $set: { status, updatedAt: now } }
    );
    await this.trackings.insertOne({
      shipid: Number(shipid),
      oid: doc.oid,
      status,
      note,
      timestamp: now
    });
    return this.findByShipId(shipid);
  }

  async checkHealth() {
    await this.db.command({ ping: 1 });
    return true;
  }

  async close() {
    await this.client.close();
  }
}

class InMemoryShipmentRepository {
  constructor() {
    this.shipments = [];
    this.trackings = [];
    this.nextShipId = 5001;
  }

  async init() {
    this.shipments = [];
    this.trackings = [];
    this.nextShipId = 5001;
  }

  _hydrate(s) {
    if (!s) return null;
    const logs = this.trackings.filter((t) => t.shipid === s.shipid);
    return new Shipment({
      shipid: s.shipid,
      oid: s.oid,
      uid: s.uid,
      status: s.status,
      tracking: logs.map((t) => ({ status: t.status, note: t.note, timestamp: t.timestamp }))
    });
  }

  async findByShipId(shipid) {
    const found = this.shipments.find((s) => s.shipid === Number(shipid));
    return this._hydrate(found);
  }

  async findByOid(oid) {
    const found = this.shipments.find((s) => s.oid === Number(oid));
    return this._hydrate(found);
  }

  async findAll() {
    return [...this.shipments].sort((a, b) => b.shipid - a.shipid).map((s) => this._hydrate(s));
  }

  async createShipment({ oid, uid, status = 'PENDING', note = '' }) {
    const existing = await this.findByOid(oid);
    if (existing) return existing;

    const shipid = this.nextShipId++;
    const now = new Date().toISOString();
    this.shipments.push({ shipid, oid: Number(oid), uid: Number(uid) || 0, status, createdAt: now, updatedAt: now });
    this.trackings.push({ shipid, oid: Number(oid), status, note, timestamp: now });
    return this.findByShipId(shipid);
  }

  async updateStatus(shipid, status, note = '') {
    const target = this.shipments.find((s) => s.shipid === Number(shipid));
    if (!target) return null;
    const now = new Date().toISOString();
    target.status = status;
    target.updatedAt = now;
    this.trackings.push({ shipid: target.shipid, oid: target.oid, status, note, timestamp: now });
    return this.findByShipId(shipid);
  }

  async checkHealth() {
    return true;
  }

  async close() {}
}

module.exports = { MongoShipmentRepository, InMemoryShipmentRepository };

