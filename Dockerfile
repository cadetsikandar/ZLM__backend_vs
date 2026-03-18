FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL deps including devDependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production deps only
# We copy the Prisma client from builder so postinstall (prisma generate) is not needed
COPY package*.json ./

# Remove postinstall script so prisma generate doesn't run during npm ci
RUN node -e "const p=require('./package.json'); delete p.scripts.postinstall; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));"

RUN npm ci --omit=dev

# Copy built output and Prisma client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

# Local storage fallback for S3
RUN mkdir -p /app/local-storage/manuscripts

# Non-root user
RUN addgroup -S zlm && adduser -S zlm -G zlm
RUN chown -R zlm:zlm /app
USER zlm

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
