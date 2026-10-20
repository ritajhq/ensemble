// The gateway Worker the cloudflare kit deploys in front of a deployment's
// other Workers and buckets. Its routes come in its `ENSEMBLE_ROUTES` var, in
// the order they're matched: each a path — exact, a `/x/*` prefix, or the
// catch-all `/*` — and what answers it, under a binding of this Worker's
// own: another Worker (`service`), an R2 bucket (`bucket`), or its static
// assets (`assets`).

export default {
  async fetch(request, env) {
    const routes = JSON.parse(env.ENSEMBLE_ROUTES);
    const url = new URL(request.url);
    const route = routes.find((candidate) =>
      matches(candidate.path, url.pathname)
    );
    if (!route) return new Response("Not found", { status: 404 });
    const binding = env[route.binding];
    if (route.kind === "service") return await binding.fetch(request);
    if (route.kind === "assets") return await binding.fetch(request);
    return await object(binding, request, url);
  },
};

export function matches(path, pathname) {
  if (path === "/*" || path === "/") return true;
  if (path.endsWith("/*")) return pathname.startsWith(path.slice(0, -1));
  return pathname === path;
}

/** An object of `bucket` at the request's path (its key, without the leading slash) — ranges and conditional requests included, as a bucket behind a CDN answers them. */
async function object(bucket, request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }
  const key = decodeURIComponent(url.pathname.slice(1));
  const found = request.method === "HEAD"
    ? await bucket.head(key)
    : await bucket.get(key, {
      range: request.headers,
      onlyIf: request.headers,
    });
  if (found === null) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  found.writeHttpMetadata(headers);
  headers.set("etag", found.httpEtag);
  headers.set("accept-ranges", "bytes");
  if (request.method === "HEAD") {
    headers.set("content-length", String(found.size));
    return new Response(null, { headers });
  }
  // No body: a condition (If-None-Match, If-Modified-Since…) wasn't met.
  if (!("body" in found)) return new Response(null, { status: 304, headers });
  const range = found.range;
  if (range && request.headers.has("range")) {
    const offset = range.offset ??
      (range.suffix !== undefined ? found.size - range.suffix : 0);
    const length = range.length ?? (range.suffix ?? found.size - offset);
    headers.set(
      "content-range",
      `bytes ${offset}-${offset + length - 1}/${found.size}`,
    );
    headers.set("content-length", String(length));
    return new Response(found.body, { status: 206, headers });
  }
  headers.set("content-length", String(found.size));
  return new Response(found.body, { headers });
}
