const { DomainError, Shipment } = require('../domain/shipment.entity');

class ShipmentUseCase {
  constructor(shipmentRepository) {
    this.shipmentRepository = shipmentRepository;
    this.eventErrorLogs = [];
  }

  async handleOrderCreatedEvent(rawPayload) {
    let parsed = rawPayload;
    if (typeof rawPayload === 'string') {
      try {
        parsed = JSON.parse(rawPayload);
      } catch (err) {
        const logEntry = { timestamp: new Date().toISOString(), reason: 'INVALID_JSON', rawPayload };
        this.eventErrorLogs.push(logEntry);
        console.error('[shipment-service] Malformed JSON event skipped:', err.message);
        return { created: false, reason: 'INVALID_JSON' };
      }
    }

    const eventData = parsed && parsed.data ? parsed.data : parsed;
    const oid = eventData && eventData.oid !== undefined ? Number(eventData.oid) : NaN;

    // TC-SHP-02: Event missing oid -> Do not create Shipment, log error
    if (!oid || Number.isNaN(oid) || oid <= 0) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        reason: 'MISSING_OID',
        payload: parsed
      };
      this.eventErrorLogs.push(logEntry);
      console.error('[shipment-service] Rejected OrderCreated event missing valid oid:', JSON.stringify(parsed));
      return { created: false, reason: 'MISSING_OID' };
    }

    // TC-SHP-05: Idempotent consumer check -> Do not create duplicate Shipment for same oid
    const existing = await this.shipmentRepository.findByOid(oid);
    if (existing) {
      console.log(`[shipment-service] Idempotent skip: Shipment already exists for oid=${oid} (shipid=${existing.shipid})`);
      return { created: false, duplicate: true, shipment: existing };
    }

    // TC-SHP-01: Create Shipment with initial status PENDING + Tracking record
    const created = await this.shipmentRepository.createShipment({
      oid,
      status: 'PENDING',
      note: 'Shipment initialized from OrderCreated event'
    });

    return { created: true, duplicate: false, shipment: created };
  }

  async getShipment({ shipid }) {
    if (!shipid || Number(shipid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid shipment shipid');
    }
    const shipment = await this.shipmentRepository.findByShipId(Number(shipid));
    if (!shipment) {
      throw new DomainError('NOT_FOUND', `Shipment shipid=${shipid} not found`);
    }
    return shipment;
  }

  async getShipmentByOrder({ oid }) {
    if (!oid || Number(oid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid order oid');
    }
    const shipment = await this.shipmentRepository.findByOid(Number(oid));
    if (!shipment) {
      throw new DomainError('NOT_FOUND', `Shipment for order oid=${oid} not found`);
    }
    return shipment;
  }

  async listShipments() {
    const items = await this.shipmentRepository.findAll();
    return { items };
  }

  async updateShipmentStatus({ shipid, status }) {
    if (!shipid || Number(shipid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid shipment shipid');
    }
    const normalizedStatus = Shipment.normalizeAndValidateStatus(status);

    const existing = await this.shipmentRepository.findByShipId(Number(shipid));
    if (!existing) {
      throw new DomainError('NOT_FOUND', `Shipment shipid=${shipid} not found`);
    }

    return this.shipmentRepository.updateStatus(
      Number(shipid),
      normalizedStatus,
      `Status updated to ${normalizedStatus}`
    );
  }
}

module.exports = { ShipmentUseCase };

