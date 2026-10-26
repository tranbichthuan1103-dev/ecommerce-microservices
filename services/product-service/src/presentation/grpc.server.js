const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const GRPC_STATUS_MAP = {
  INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  ALREADY_EXISTS: grpc.status.ALREADY_EXISTS,
  INSUFFICIENT_STOCK: grpc.status.FAILED_PRECONDITION
};

function mapErrorToGrpc(err) {
  const code = GRPC_STATUS_MAP[err.code] || grpc.status.INTERNAL;
  return { code, message: err.message || 'Internal server error' };
}

function createProductGrpcServer(productUseCase, productRepository, protoDir) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');
  const protoPath = path.join(resolvedProtoDir, 'product.proto');

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const productProto = grpc.loadPackageDefinition(packageDef).product;

  const server = new grpc.Server();

  server.addService(productProto.ProductService.service, {
    ListProducts: async (_call, callback) => {
      try {
        callback(null, await productUseCase.listProducts());
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    GetProduct: async (call, callback) => {
      try {
        callback(null, await productUseCase.getProduct(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    CreateProduct: async (call, callback) => {
      try {
        callback(null, await productUseCase.createProduct(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    UpdateProduct: async (call, callback) => {
      try {
        callback(null, await productUseCase.updateProduct(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    UpdateInventory: async (call, callback) => {
      try {
        callback(null, await productUseCase.updateInventory(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    DeleteProduct: async (call, callback) => {
      try {
        callback(null, await productUseCase.deleteProduct(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    ReserveInventory: async (call, callback) => {
      try {
        callback(null, await productUseCase.reserveInventory(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    ReleaseInventory: async (call, callback) => {
      try {
        callback(null, await productUseCase.releaseInventory(call.request));
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    HealthCheck: async (_call, callback) => {
      try {
        await productRepository.checkHealth();
        callback(null, { status: 'UP', service: 'product-service' });
      } catch (err) {
        callback({ code: grpc.status.UNAVAILABLE, message: err.message });
      }
    }
  });

  return server;
}

module.exports = { createProductGrpcServer };

