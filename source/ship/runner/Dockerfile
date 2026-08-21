FROM denoland/deno:alpine-2.9.3

RUN apk add --no-cache git github-cli curl docker-cli docker-cli-buildx docker-cli-compose minio-client coreutils libstdc++ libgcc jq

# Alias minio-client mcli to mc to avoid breaking existing scripts
RUN ln -s /usr/bin/mcli /usr/bin/mc

WORKDIR /app

COPY --from=artifacts cli/main.js ./cli/main.js

# So a workflow step's `run:` can shell out to bare `ens ...` (e.g.
# workflows/release's `ens pack cli deno.compile`) the same way it would on a
# machine with the compiled `ens` binary installed — inside this container
# that's this same cli/main.js, just invoked via `deno run` instead of as a
# standalone binary. --cached-only fails fast instead of silently hitting the
# network if a module somehow isn't already cached — should never trigger,
# since main.js is a bundle with no remaining remote imports, but cheap
# insurance against a broken build going unnoticed. (--no-check isn't needed
# here: with no deno.json shipped in this image, deno run already skips
# type-checking by default — measured no difference either way.)
RUN printf '#!/bin/sh\nexec deno run -A --cached-only /app/cli/main.js "$@"\n' > /usr/local/bin/ens && \
    chmod +x /usr/local/bin/ens

WORKDIR /workspace

ENTRYPOINT ["deno", "run", "-A", "/app/cli/main.js"]
