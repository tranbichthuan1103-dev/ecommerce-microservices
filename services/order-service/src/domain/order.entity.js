class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

class DiscountPolicy {
  /**
   * Tiered percentage discount policy based on Customer Membership score:
   * - score >= 1000 (Platinum): 15%
   * - score >= 500  (Gold):     10%
   * - score >= 100  (Silver):    5%
   * - score <  100  (Bronze):    0%
   */
  static getRate(score) {
    const numericScore = Number(score) || 0;
    if (numericScore >= 1000) return 0.15;
    if (numericScore >= 500) return 0.10;
    if (numericScore >= 100) return 0.05;
    return 0.0;
  }

  static calculate(subtotal, score) {
    const rate = DiscountPolicy.getRate(score);
    return Number((Number(subtotal) * rate).toFixed(2));
  }
}

class Order {
  constructor({ oid = null, uid, discount = 0, items = [] }) {
    this.oid = oid ? Number(oid) : null;
    this.uid = Number(uid);
    this.discount = Number(discount);
    this.items = items.map((i) => ({
      pid: Number(i.pid),
      qty: Number(i.qty),
      unit_price: Number(i.unit_price)
    }));
  }

  static normalizeAndValidateInput({ uid, items }) {
    if (!uid || Number(uid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Valid customer uid is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Order must contain at least one item');
    }

    const consolidated = new Map();
    for (const item of items) {
      const pid = Number(item.pid);
      const qty = Number(item.qty);
      if (!pid || pid <= 0 || !qty || !Number.isInteger(qty) || qty <= 0) {
        throw new DomainError('INVALID_ARGUMENT', 'Each order item must have pid > 0 and integer qty > 0');
      }
      consolidated.set(pid, (consolidated.get(pid) || 0) + qty);
    }

    return Array.from(consolidated.entries()).map(([pid, qty]) => ({ pid, qty }));
  }
}

module.exports = { DomainError, DiscountPolicy, Order };

