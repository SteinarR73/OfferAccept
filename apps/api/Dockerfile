# ─── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# This repo is pnpm-only (see package.json "packageManager" + preinstall guard).
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# Copy workspace manifests first for layer caching. All workspace packages'
# manifests are needed (not just this app's) so pnpm's frozen-lockfile install
# sees the same workspace shape as pnpm-lock.yaml was generated against.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/

# Install all dependencies (including devDeps needed for the build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/types ./packages/types
COPY packages/database ./packages/database

# Generate Prisma client and build
RUN pnpm --filter @offeraccept/database run db:generate
RUN pnpm --filter @offeraccept/api run build

# ─── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Full node_modules (workspace symlinks + the pnpm virtual store, which holds
# the generated Prisma client) copied as-is from the builder stage. pnpm's
# store layout makes selective production-only pruning nontrivial to get
# right across a workspace — correctness over image size here.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/database ./packages/database

EXPOSE 3001

# Compiled entry lives under this nested path because apps/api/tsconfig.json's
# "paths" pull in cross-package source files, which makes tsc infer a repo-root
# rootDir instead of "src" — see nest-cli.json's "entryFile" for the matching fix.
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
