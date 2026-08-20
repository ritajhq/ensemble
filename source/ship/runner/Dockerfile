FROM denoland/deno:alpine-2.9.3

RUN apk add --no-cache git github-cli curl docker-cli docker-cli-buildx docker-cli-compose minio-client coreutils libstdc++ libgcc jq

# Alias minio-client mcli to mc to avoid breaking existing scripts
RUN ln -s /usr/bin/mcli /usr/bin/mc

WORKDIR /app

COPY --from=packages ensemble-linux-x64 /usr/local/bin/ens

WORKDIR /workspace

ENTRYPOINT ["ens"]
