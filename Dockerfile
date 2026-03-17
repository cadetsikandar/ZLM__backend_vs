FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

RUN npm run db:generate
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --only=production

# Copy built files and prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

# Create local storage directory for S3 fallback
RUN mkdir -p /app/local-storage/manuscripts

# Non-root user for security
RUN addgroup -S zlm && adduser -S zlm -G zlm
RUN chown -R zlm:zlm /app
USER zlm

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
