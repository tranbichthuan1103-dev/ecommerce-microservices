FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY services/order-service/package*.json ./services/order-service/

WORKDIR /app/services/order-service
RUN npm install --omit=dev

COPY services/order-service/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV ORDER_GRPC_PORT=50054

EXPOSE 50054

CMD ["node", "src/index.js"]

