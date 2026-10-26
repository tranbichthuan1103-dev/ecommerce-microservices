FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY services/shipment-service/package*.json ./services/shipment-service/

WORKDIR /app/services/shipment-service
RUN npm install --omit=dev

COPY services/shipment-service/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV SHIPMENT_GRPC_PORT=50055

EXPOSE 50055

CMD ["node", "src/index.js"]

