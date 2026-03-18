# ═══════════════════════════════════════════════════════════════════
# ZLM Backend — Production Dockerfile
# Node 20 Alpine | Multi-stage build
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Copy prisma schema BEFORE npm ci so postinstall (prisma generate) works
COPY prisma ./prisma

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Copy prisma schema BEFORE npm ci so postinstall (prisma generate) works
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/local-storage/manuscripts

RUN addgroup -S zlm && adduser -S zlm -G zlm
RUN chown -R zlm:zlm /app
USER zlm

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]