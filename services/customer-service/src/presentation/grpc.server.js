const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const GRPC_STATUS_MAP = {
  INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
  ALREADY_EXISTS: grpc.status.ALREADY_EXISTS,
  NOT_FOUND: grpc.status.NOT_FOUND,
  UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
  PERMISSION_DENIED: grpc.status.PERMISSION_DENIED
};

function mapErrorToGrpc(err) {
  const code = GRPC_STATUS_MAP[err.code] || grpc.status.INTERNAL;
  return { code, message: err.message || 'Internal server error' };
}

function createCustomerGrpcServer(customerUseCase, customerRepository, protoDir) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');
  const protoPath = path.join(resolvedProtoDir, 'customer.proto');

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const customerProto = grpc.loadPackageDefinition(packageDef).customer;

  const server = new grpc.Server();

  server.addService(customerProto.CustomerService.service, {
    CreateCustomer: async (call, callback) => {
      try {
        callback(null, await customerUseCase.createCustomer(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetCustomer: async (call, callback) => {
      try {
        callback(null, await customerUseCase.getCustomer(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    UpdateCustomer: async (call, callback) => {
      try {
        callback(null, await customerUseCase.updateCustomer(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetCustomerScore: async (call, callback) => {
      try {
        callback(null, await customerUseCase.getCustomerScore(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    ListMemberships: async (_call, callback) => {
      try {
        callback(null, await customerUseCase.listMemberships());
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetMembership: async (call, callback) => {
      try {
        callback(null, await customerUseCase.getMembership(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    CreateMembership: async (call, callback) => {
      try {
        callback(null, await customerUseCase.createMembership(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    UpdateMembership: async (call, callback) => {
      try {
        callback(null, await customerUseCase.updateMembership(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    HealthCheck: async (_call, callback) => {
      try {
        await customerRepository.checkHealth();
        callback(null, { status: 'UP', service: 'customer-service' });
      } catch (err) {
        callback({ code: grpc.status.UNAVAILABLE, message: err.message });
      }
    }
  });

  return server;
}

module.exports = { createCustomerGrpcServer };

