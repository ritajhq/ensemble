# Caddy ships without DNS-provider modules, and a wildcard certificate can
# only be obtained by answering the ACME DNS challenge — so Cloudflare's
# module is compiled in. Everything else is the stock image.
FROM caddy:2.11-builder-alpine AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2.11-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
