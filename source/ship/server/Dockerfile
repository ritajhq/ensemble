FROM denoland/deno:alpine-2.9.3

WORKDIR /app
COPY --from=artifacts cli/main.js ./cli/main.js
COPY --from=artifacts server/main.js ./server/main.js

# Makes `ens` available on PATH so run:/script: steps inside triggered
# workflows can shell out to it (e.g. `run: ens build my-app`), without
# bundling the server itself into the CLI package.
RUN printf '#!/bin/sh\nexec deno run -A /app/cli/main.js "$@"\n' > /usr/local/bin/ens \
  && chmod +x /usr/local/bin/ens

# The actual ensemble project (.ensemble/ + workflows/) is expected to be
# bind-mounted here at run time, e.g. `docker run -v /path/on/host:/repo ...`
# — findRepoRoot() walks up from the working directory, so this just needs
# to be that project's root.
WORKDIR /repo

EXPOSE 8787
CMD ["deno", "run", "-A", "/app/server/main.js"]
