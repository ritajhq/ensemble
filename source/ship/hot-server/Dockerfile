FROM denoland/deno:alpine
WORKDIR /app

# mc — MinIO client, used by entrypoint.sh to mirror a versioned release
# prefix from an S3-compatible bucket (e.g. Garage) into SERVE_DIR before the
# server starts. Only invoked when RELEASE_PATH is set — local dev instead
# bind-syncs artifacts straight into SERVE_DIR (see docker-compose.yml).
RUN apk add --no-cache curl
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)  MC_ARCH=amd64 ;; \
      aarch64) MC_ARCH=arm64 ;; \
      *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://dl.min.io/client/mc/release/linux-${MC_ARCH}/mc" -o /usr/local/bin/mc; \
    chmod +x /usr/local/bin/mc

COPY src/. .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV SERVE_DIR=/app/www
RUN mkdir -p $SERVE_DIR
RUN deno cache main.ts

ENTRYPOINT ["/entrypoint.sh"]
CMD ["deno", "run", "-A", "main.ts"]
EXPOSE 8000