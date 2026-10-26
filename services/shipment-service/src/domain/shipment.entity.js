class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const VALID_SHIPMENT_STATUSES = [
  'PENDING',
  'PICKED',
  'SHIPPING',
  'DELIVERED',
  'CANCELLED',
  'RETURNED'
];

class Shipment {
  constructor({ shipid, oid, status = 'PENDING', tracking = [] }) {
    this.shipid = Number(shipid);
    this.oid = Number(oid);
    this.status = status;
    this.tracking = tracking;
  }

  static normalizeAndValidateStatus(status) {
    if (!status || typeof status !== 'string' || status.trim().length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Shipment status is required');
    }
    const upper = status.trim().toUpperCase();
    if (!VALID_SHIPMENT_STATUSES.includes(upper)) {
      throw new DomainError(
        'INVALID_ARGUMENT',
        `Invalid status '${status}'. Allowed values: ${VALID_SHIPMENT_STATUSES.join(', ')}`
      );
    }
    return upper;
  }
}

module.exports = { DomainError, VALID_SHIPMENT_STATUSES, Shipment };

