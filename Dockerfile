FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/local-storage/manuscripts

RUN groupadd -r zlm && useradd -r -g zlm zlm
RUN chown -R zlm:zlm /app
USER zlm

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]