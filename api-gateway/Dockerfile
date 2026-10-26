FROM node:20-alpine

WORKDIR /app

COPY proto ./proto
COPY api-gateway/package*.json ./api-gateway/

WORKDIR /app/api-gateway
RUN npm install --omit=dev

COPY api-gateway/src ./src

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto
ENV GATEWAY_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/index.js"]

