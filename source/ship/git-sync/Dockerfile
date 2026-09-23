FROM denoland/deno:latest
# ca-certificates isn't in this base image by default — without it, git's HTTPS
# clone of github.com fails with "Problem with the SSL CA cert (path? access rights?)".
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=git-sync . /app
EXPOSE 8080
CMD ["run", "-A", "/app/main.js"]
