FROM denoland/deno:latest
# git clones and pushes projects; ca-certificates lets it reach github.com.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# The docker CLI with its compose and buildx plugins, talking to the host's
# daemon through the socket the stack mounts: deploys and release packs run
# against it.
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:28-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /app
COPY --from=platform/server . /app/server
COPY --from=platform/web . /app/web
COPY --from=cli . /app/ens
RUN printf '#!/bin/sh\nexec deno run -A /app/ens/main.js "$@"\n' > /usr/local/bin/ens \
    && chmod +x /usr/local/bin/ens
ENV PLATFORM_WEB=/app/web
EXPOSE 8090
CMD ["run", "-A", "--unstable-kv", "/app/server/main.js"]
