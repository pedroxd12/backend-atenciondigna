# ─────────────────────────────────────────────
# Atencion Digna — Backend NestJS
# Multi-stage build para imagen final pequeña.
# ─────────────────────────────────────────────

# ── Stage 1: builder ──
FROM node:20-slim AS builder

WORKDIR /app

# OpenSSL es requerido por Prisma
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Instalar TODAS las dependencias (incluyendo dev) — necesarias para nest build
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Copiar el codigo fuente y construir
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build


# ── Stage 2: runtime ──
FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Instalar SOLO dependencias de produccion. El postinstall corre `prisma generate`
# automaticamente, asi que el cliente queda disponible en node_modules.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el dist compilado del builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
