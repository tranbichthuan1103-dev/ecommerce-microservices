const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const GRPC_STATUS_MAP = {
  INVALID_ARGUMENT: grpc.status.INVALID_ARGUMENT,
  ALREADY_EXISTS: grpc.status.ALREADY_EXISTS,
  UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
  PERMISSION_DENIED: grpc.status.PERMISSION_DENIED,
  NOT_FOUND: grpc.status.NOT_FOUND
};

function mapErrorToGrpc(err) {
  const code = GRPC_STATUS_MAP[err.code] || grpc.status.INTERNAL;
  return { code, message: err.message || 'Internal server error' };
}

function createAuthGrpcServer(authUseCase, userRepository, protoDir) {
  const resolvedProtoDir = protoDir || process.env.PROTO_DIR || path.resolve(__dirname, '../../../../proto');
  const protoPath = path.join(resolvedProtoDir, 'auth.proto');

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const authProto = grpc.loadPackageDefinition(packageDef).auth;

  const server = new grpc.Server();

  server.addService(authProto.AuthService.service, {
    Register: async (call, callback) => {
      try {
        const result = await authUseCase.register(call.request);
        callback(null, result);
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    Login: async (call, callback) => {
      try {
        const result = await authUseCase.login(call.request);
        callback(null, result);
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    VerifyToken: async (call, callback) => {
      try {
        const result = await authUseCase.verifyToken(call.request);
        callback(null, result);
      } catch (err) {
        callback(mapErrorToGrpc(err));
      }
    },
    HealthCheck: async (_call, callback) => {
      try {
        await userRepository.checkHealth();
        callback(null, { status: 'UP', service: 'auth-service' });
      } catch (err) {
        callback({ code: grpc.status.UNAVAILABLE, message: err.message });
      }
    }
  });

  return server;
}

module.exports = { createAuthGrpcServer };

