FROM denoland/deno:alpine-2.9.3

RUN apk add --no-cache git github-cli curl docker-cli docker-cli-buildx minio-client

# Alias minio-client mcli to mc to avoid breaking existing scripts
RUN ln -s /usr/bin/mcli /usr/bin/mc

ENV GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
ENV GH_TOKEN=$GH_TOKEN
ENV REGISTRY_USERNAME=$REGISTRY_USERNAME
ENV REGISTRY_PASSWORD=$REGISTRY_PASSWORD
ENV S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
ENV S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY

WORKDIR /app

COPY --from=packages cli.exe /usr/local/bin/ens
COPY --from=artifacts server/main.js ./server/main.js

WORKDIR /workspace

CMD ["deno", "run", "-A", "--unstable-kv", "/app/server/main.js"]

EXPOSE 8787