# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/assert/package.json ./packages/assert/
COPY packages/logger/package.json ./packages/logger/
COPY packages/object-store/package.json ./packages/object-store/
COPY packages/secret-store/package.json ./packages/secret-store/
COPY packages/secret-string/package.json ./packages/secret-string/
COPY packages/vault/package.json ./packages/vault/
COPY packages/9router/package.json ./packages/9router/

RUN bun install --frozen-lockfile

COPY tsconfig.json turbo.json ./
COPY packages/api ./packages/api
COPY packages/assert ./packages/assert
COPY packages/logger ./packages/logger
COPY packages/object-store ./packages/object-store
COPY packages/secret-store ./packages/secret-store
COPY packages/secret-string ./packages/secret-string
COPY packages/vault ./packages/vault

FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app

RUN chown -R bun:bun /app

EXPOSE 8080

USER bun

CMD ["bun", "packages/api/src/api.ts"]
