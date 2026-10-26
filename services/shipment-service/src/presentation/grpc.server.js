const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const GRPC_STATUS_MAP = {
  INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND
};

function mapErrorToGrpc(err) {
  const code = GRPC_STATUS_MAP[err.code] || grpc.status.INTERNAL;
  return { code, message: err.message || 'Internal server error' };
}

function createShipmentGrpcServer(shipmentUseCase, shipmentRepository, protoDir) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');
  const protoPath = path.join(resolvedProtoDir, 'shipment.proto');

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const shipmentProto = grpc.loadPackageDefinition(packageDef).shipment;

  const server = new grpc.Server();

  server.addService(shipmentProto.ShipmentService.service, {
    GetShipment: async (call, callback) => {
      try {
        callback(null, await shipmentUseCase.getShipment(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetShipmentByOrder: async (call, callback) => {
      try {
        callback(null, await shipmentUseCase.getShipmentByOrder(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    ListShipments: async (_call, callback) => {
      try {
        callback(null, await shipmentUseCase.listShipments());
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    UpdateShipmentStatus: async (call, callback) => {
      try {
        callback(null, await shipmentUseCase.updateShipmentStatus(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    HealthCheck: async (_call, callback) => {
      try {
        await shipmentRepository.checkHealth();
        callback(null, { status: 'UP', service: 'shipment-service' });
      } catch (err) {
        callback({ code: grpc.status.UNAVAILABLE, message: err.message });
      }
    }
  });

  return server;
}

module.exports = { createShipmentGrpcServer };

