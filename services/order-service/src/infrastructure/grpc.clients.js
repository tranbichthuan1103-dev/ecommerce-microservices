const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { DomainError } = require('../domain/order.entity');

const PROTO_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};

function mapDownstreamGrpcError(err) {
  if (!err || typeof err.code !== 'number') {
    return new DomainError('INTERNAL', err ? err.message : 'Downstream service error');
  }
  switch (err.code) {
    case grpc.status.INVALID_ARGUMENT:
      return new DomainError('INVALID_ARGUMENT', err.details || err.message);
    case grpc.status.NOT_FOUND:
      return new DomainError('NOT_FOUND', err.details || err.message);
    case grpc.status.FAILED_PRECONDITION:
    case grpc.status.ALREADY_EXISTS:
      return new DomainError('INSUFFICIENT_STOCK', err.details || err.message);
    case grpc.status.UNAVAILABLE:
      return new DomainError('UNAVAILABLE', err.details || 'Downstream microservice unavailable');
    default:
      return new DomainError('INTERNAL', err.details || err.message);
  }
}

function createDownstreamGrpcClients({ customerServiceUrl, productServiceUrl, protoDir }) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');

  const customerDef = protoLoader.loadSync(path.join(resolvedProtoDir, 'customer.proto'), PROTO_OPTIONS);
  const productDef = protoLoader.loadSync(path.join(resolvedProtoDir, 'product.proto'), PROTO_OPTIONS);

  const CustomerService = grpc.loadPackageDefinition(customerDef).customer.CustomerService;
  const ProductService = grpc.loadPackageDefinition(productDef).product.ProductService;

  const rawCustomerClient = new CustomerService(customerServiceUrl, grpc.credentials.createInsecure());
  const rawProductClient = new ProductService(productServiceUrl, grpc.credentials.createInsecure());

  const invoke = (client, method, payload) =>
    new Promise((resolve, reject) => {
      client[method](payload, (err, res) => {
        if (err) return reject(mapDownstreamGrpcError(err));
        resolve(res);
      });
    });

  return {
    getCustomerScore: (uid) => invoke(rawCustomerClient, 'GetCustomerScore', { uid: Number(uid) }),
    reserveInventory: (items) => invoke(rawProductClient, 'ReserveInventory', { items }),
    releaseInventory: (items) => invoke(rawProductClient, 'ReleaseInventory', { items }),
    close: () => {
      rawCustomerClient.close();
      rawProductClient.close();
    }
  };
}

module.exports = { createDownstreamGrpcClients };

