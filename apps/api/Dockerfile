# ─── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/

# Install all dependencies (including devDeps needed for the build)
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/types ./packages/types
COPY packages/database ./packages/database

# Generate Prisma client and build
RUN npm run db:generate
RUN npm run build --workspace=apps/api

# ─── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production manifests
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled output and generated Prisma client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/database ./packages/database

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
