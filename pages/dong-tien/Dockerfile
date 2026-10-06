# ==========================================
# Stage 1 — Dependencies
# ==========================================
FROM node:22-alpine AS deps

WORKDIR /app

# Install libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./

# Use npm cache mount to speed up repeated builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline


# ==========================================
# Stage 2 — Builder
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_ENV=production

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ==========================================
# Stage 3 — Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Required for Next.js standalone server to listen on all interfaces
ENV HOSTNAME=0.0.0.0
ENV PORT=3002

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone build output (includes server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static   ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public         ./public

USER nextjs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/dong-tien/api/health || exit 1

CMD ["node", "server.js"]
