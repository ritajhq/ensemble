FROM caddy:2.11-alpine
# The platform writes /router/Caddyfile into the volume both share, and
# rewrites it whenever what it routes changes; --watch reloads it then. The
# admin API stays on the container's own loopback, out of reach of every
# deployment on the ingress network. Until the platform has written a first
# one, there is nothing to serve.
CMD ["sh", "-c", "until [ -f /router/Caddyfile ]; do sleep 1; done; exec caddy run --config /router/Caddyfile --adapter caddyfile --watch"]
