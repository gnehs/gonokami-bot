FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Install CA certificates for HTTPS (Telegram API uses TLS)
RUN apk add --no-cache ca-certificates && update-ca-certificates
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY . .
RUN mkdir -p data && \
    echo {} > data/subscriptions.json && \
    echo {} > data/votes.json && \
    echo {} > data/usage.json

ENV NODE_ENV=production
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

CMD ["node", "bot.ts"]
