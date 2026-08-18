# ─── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# This repo is pnpm-only (see package.json "packageManager" + preinstall guard).
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

# All workspace packages' manifests are needed (not just this app's) so pnpm's
# frozen-lockfile install sees the same workspace shape as the lockfile expects.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/types ./packages/types

# NEXT_PUBLIC_API_URL must be set at build time — it is inlined into the JS bundle.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm --filter @offeraccept/web run build

# ─── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# next.js standalone output (output: 'standalone' in next.config.ts) — Next's
# tracer already produces a minimal, self-contained node_modules here, so no
# manual dependency copying is needed for the web image.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
