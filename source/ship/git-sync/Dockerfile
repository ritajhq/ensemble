FROM denoland/deno:latest
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=git-sync . /app
EXPOSE 8080
CMD ["run", "-A", "/app/main.js"]
