FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Install CA certificates for HTTPS (Telegram API uses TLS)
RUN apk add --no-cache ca-certificates && update-ca-certificates
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Install only production dependencies for final image size
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ---------- Build Stage ----------
FROM base AS builder
COPY package.json pnpm-lock.yaml ./
# Install all dependencies including dev for compilation
RUN pnpm install --frozen-lockfile
COPY . .
# Build TypeScript -> dist
RUN pnpm run build

# ---------- Production Stage ----------
FROM base
ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
WORKDIR /app
# Copy compiled JS and other assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
# Ensure data directory exists in case not copied
RUN mkdir -p data && \
    echo {} > data/subscriptions.json && \
    echo {} > data/votes.json && \
    echo {} > data/usage.json

CMD ["node", "dist/bot.js"]