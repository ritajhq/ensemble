FROM denoland/deno:alpine-2.9.3

RUN apk add --no-cache git github-cli curl docker-cli

WORKDIR /app

COPY --from=packages cli.exe /usr/local/bin/ens
COPY --from=artifacts server/main.js ./server/main.js

WORKDIR /workspace

CMD ["deno", "run", "-A", "/app/server/main.js"]

EXPOSE 8787