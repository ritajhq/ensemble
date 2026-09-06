FROM denoland/deno:latest
WORKDIR /app
COPY --from=website/server . /app/server
COPY --from=website/content . /app/content
EXPOSE 8000
CMD ["run", "-A", "/app/server/main.js"]
