FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY services/customer-service/package*.json ./services/customer-service/

WORKDIR /app/services/customer-service
RUN npm install --omit=dev

COPY services/customer-service/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV CUSTOMER_GRPC_PORT=50052

EXPOSE 50052

CMD ["node", "src/index.js"]

