FROM denoland/deno:alpine-2.9.3

RUN apk add --no-cache docker-cli git curl

WORKDIR /app

COPY --from=artifacts server/main.js ./server/main.js

WORKDIR /workspace

CMD ["deno", "run", "-A", "--unstable-kv", "/app/server/main.js"]

EXPOSE 8787