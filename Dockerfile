FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY prisma ./prisma

RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

RUN mkdir -p /app/local-storage/manuscripts

RUN groupadd -r zlm && useradd -r -g zlm zlm
RUN chown -R zlm:zlm /app
USER zlm

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]