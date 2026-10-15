# What releases run beside ens: gh publishes the CLI as a GitHub release, and
# git-cliff writes the changelog in the release hook.
FROM debian:bookworm-slim AS release-tools
ARG TARGETARCH
ARG GH_VERSION=2.102.0
ARG GIT_CLIFF_VERSION=2.14.2
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && case "$TARGETARCH" in arm64) cliff_arch=aarch64 ;; *) cliff_arch=x86_64 ;; esac \
    && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH:-amd64}.tar.gz" \
       | tar -xz --strip-components=2 -C /usr/local/bin "gh_${GH_VERSION}_linux_${TARGETARCH:-amd64}/bin/gh" \
    && curl -fsSL "https://github.com/orhun/git-cliff/releases/download/v${GIT_CLIFF_VERSION}/git-cliff-${GIT_CLIFF_VERSION}-${cliff_arch}-unknown-linux-gnu.tar.gz" \
       | tar -xz --strip-components=1 -C /usr/local/bin "git-cliff-${GIT_CLIFF_VERSION}/git-cliff"

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
COPY --from=release-tools /usr/local/bin/gh /usr/local/bin/git-cliff /usr/local/bin/
WORKDIR /app
COPY --from=platform/server . /app/server
COPY --from=platform/web . /app/web
COPY --from=cli . /app/ens
RUN printf '#!/bin/sh\nexec deno run -A /app/ens/main.js "$@"\n' > /usr/local/bin/ens \
    && chmod +x /usr/local/bin/ens
ENV PLATFORM_WEB=/app/web
EXPOSE 8090
CMD ["run", "-A", "--unstable-kv", "/app/server/main.js"]
