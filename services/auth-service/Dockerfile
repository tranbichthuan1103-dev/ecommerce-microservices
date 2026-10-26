FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY services/auth-service/package*.json ./services/auth-service/

WORKDIR /app/services/auth-service
RUN npm install --omit=dev

COPY services/auth-service/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV AUTH_GRPC_PORT=50051

EXPOSE 50051

CMD ["node", "src/index.js"]

