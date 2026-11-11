FROM denoland/deno:latest
# git fetches the docs; ca-certificates lets it reach github.com over HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=website/server . /app/server
COPY --from=website/content . /app/content
EXPOSE 8000
CMD ["run", "-A", "/app/server/main.js"]
