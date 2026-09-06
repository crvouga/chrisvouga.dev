# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY pkgs/assert/package.json ./pkgs/assert/
COPY pkgs/logger/package.json ./pkgs/logger/
COPY pkgs/object-store/package.json ./pkgs/object-store/
COPY pkgs/secret-store/package.json ./pkgs/secret-store/
COPY pkgs/secret-string/package.json ./pkgs/secret-string/
COPY pkgs/vault/package.json ./pkgs/vault/

RUN bun install --frozen-lockfile

COPY tsconfig.json turbo.json ./
COPY apps/api ./apps/api
COPY pkgs ./pkgs
COPY scripts ./scripts

FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app

RUN chown -R bun:bun /app

EXPOSE 8080

USER bun

CMD ["bun", "apps/api/src/api.ts"]
