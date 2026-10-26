FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY services/product-service/package*.json ./services/product-service/

WORKDIR /app/services/product-service
RUN npm install --omit=dev

COPY services/product-service/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV PRODUCT_GRPC_PORT=50053

EXPOSE 50053

CMD ["node", "src/index.js"]

