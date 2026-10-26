const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const GRPC_STATUS_MAP = {
  INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  INSUFFICIENT_STOCK: grpc.status.FAILED_PRECONDITION,
  UNAVAILABLE: grpc.status.UNAVAILABLE
};

function mapErrorToGrpc(err) {
  const code = GRPC_STATUS_MAP[err.code] || grpc.status.INTERNAL;
  return { code, message: err.message || 'Internal server error' };
}

function createOrderGrpcServer(orderUseCase, orderRepository, protoDir, publisher) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');
  const protoPath = path.join(resolvedProtoDir, 'order.proto');

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const orderProto = grpc.loadPackageDefinition(packageDef).order;

  const server = new grpc.Server();

  server.addService(orderProto.OrderService.service, {
    CreateOrder: async (call, callback) => {
      try {
        callback(null, await orderUseCase.createOrder(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetOrder: async (call, callback) => {
      try {
        callback(null, await orderUseCase.getOrder(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    ListOrders: async (call, callback) => {
      try {
        callback(null, await orderUseCase.listOrders(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    PublishTestEvent: async (call, callback) => {
      try {
        if (!publisher) {
          return callback({ code: grpc.status.UNAVAILABLE, message: 'Event publisher not configured' });
        }
        const parsed = JSON.parse(call.request.raw_json || '{}');
        await publisher.publish(call.request.key || 'test-key', parsed);
        callback(null, { published: true, topic: publisher.topic || 'order-created' });
      } catch (err) {
        callback({ code: grpc.status.INVALID_ARGUMENT, message: err.message });
      }
    },
    HealthCheck: async (_call, callback) => {
      try {
        await orderRepository.checkHealth();
        callback(null, { status: 'UP', service: 'order-service' });
      } catch (err) {
        callback({ code: grpc.status.UNAVAILABLE, message: err.message });
      }
    }
  });

  return server;
}

module.exports = { createOrderGrpcServer };

