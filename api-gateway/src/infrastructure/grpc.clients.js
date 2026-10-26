const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};

function grpcErrorToHttp(err) {
  if (!err || typeof err.code !== 'number') {
    return { status: 500, message: err ? err.message : 'Internal Server Error' };
  }
  const message = err.details || err.message || 'Request failed';
  switch (err.code) {
    case grpc.status.INVALID_ARGUMENT:
      return { status: 400, message };
    case grpc.status.UNAUTHENTICATED:
      return { status: 401, message };
    case grpc.status.PERMISSION_DENIED:
      return { status: 403, message };
    case grpc.status.NOT_FOUND:
      return { status: 404, message };
    case grpc.status.ALREADY_EXISTS:
    case grpc.status.FAILED_PRECONDITION:
      return { status: 409, message };
    case grpc.status.UNAVAILABLE:
      return { status: 503, message: 'Downstream microservice unavailable' };
    default:
      return { status: 500, message };
  }
}

function promisifyClient(rawClient, methods) {
  const api = {};
  for (const m of methods) {
    api[m] = (payload = {}) =>
      new Promise((resolve, reject) => {
        rawClient[m](payload, (err, res) => {
          if (err) return reject(err);
          resolve(res);
        });
      });
  }
  api.close = () => rawClient.close();
  return api;
}

function createGatewayGrpcClients(config = {}) {
  const protoDir = config.protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../proto');

  const load = (file, pkg, svc) => {
    const def = protoLoader.loadSync(path.join(protoDir, file), PROTO_OPTIONS);
    return grpc.loadPackageDefinition(def)[pkg][svc];
  };

  const AuthService = load('auth.proto', 'auth', 'AuthService');
  const CustomerService = load('customer.proto', 'customer', 'CustomerService');
  const ProductService = load('product.proto', 'product', 'ProductService');
  const OrderService = load('order.proto', 'order', 'OrderService');
  const ShipmentService = load('shipment.proto', 'shipment', 'ShipmentService');

  const creds = grpc.credentials.createInsecure();

  const auth = promisifyClient(
    new AuthService(config.authServiceUrl || process.env.AUTH_SERVICE_URL || 'localhost:50051', creds),
    ['Register', 'Login', 'VerifyToken', 'HealthCheck']
  );

  const customer = promisifyClient(
    new CustomerService(config.customerServiceUrl || process.env.CUSTOMER_SERVICE_URL || 'localhost:50052', creds),
    [
      'CreateCustomer',
      'GetCustomer',
      'UpdateCustomer',
      'GetCustomerScore',
      'ListMemberships',
      'GetMembership',
      'CreateMembership',
      'UpdateMembership',
      'HealthCheck'
    ]
  );

  const product = promisifyClient(
    new ProductService(config.productServiceUrl || process.env.PRODUCT_SERVICE_URL || 'localhost:50053', creds),
    [
      'ListProducts',
      'GetProduct',
      'CreateProduct',
      'UpdateProduct',
      'UpdateInventory',
      'DeleteProduct',
      'HealthCheck'
    ]
  );

  const order = promisifyClient(
    new OrderService(config.orderServiceUrl || process.env.ORDER_SERVICE_URL || 'localhost:50054', creds),
    ['CreateOrder', 'GetOrder', 'ListOrders', 'PublishTestEvent', 'HealthCheck']
  );

  const shipment = promisifyClient(
    new ShipmentService(config.shipmentServiceUrl || process.env.SHIPMENT_SERVICE_URL || 'localhost:50055', creds),
    ['GetShipment', 'GetShipmentByOrder', 'ListShipments', 'UpdateShipmentStatus', 'HealthCheck']
  );

  return {
    auth,
    customer,
    product,
    order,
    shipment,
    closeAll: () => {
      auth.close();
      customer.close();
      product.close();
      order.close();
      shipment.close();
    }
  };
}

module.exports = { createGatewayGrpcClients, grpcErrorToHttp };

