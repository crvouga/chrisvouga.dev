FROM golang:1.25-alpine AS health-proxy-builder

WORKDIR /src
COPY health-proxy.go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /health-proxy ./health-proxy.go

FROM quay.io/openbao/openbao:latest

LABEL org.opencontainers.image.source="https://github.com/crvouga/infra"
LABEL org.opencontainers.image.description="Standalone OpenBao vault for chrisvouga.dev"

USER root

COPY config/openbao.hcl /etc/openbao/openbao.hcl
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=health-proxy-builder /health-proxy /usr/local/bin/health-proxy

RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/health-proxy

USER openbao

EXPOSE 8200

ENTRYPOINT ["docker-entrypoint.sh"]
