import { assertEquals } from "@std/assert";
import { caddyfile } from "./caddy-config.ts";

Deno.test("caddyfile: a plain string path is a passthrough `handle` block, matcher emitted verbatim (a trailing * is Caddy's own wildcard)", () => {
  const conf = caddyfile([
    {
      host: "a.localhost",
      path: "/cover*",
      target: { service: "cover", port: 8080 },
    },
  ], undefined);

  assertEquals(
    conf,
    `http://a.localhost {
\thandle /cover* {
\t\treverse_proxy http://cover:8080
\t}
}
`,
  );
});

Deno.test("caddyfile: { match, strip: true } is `handle_path`, Caddy's own prefix-stripping directive", () => {
  const conf = caddyfile([
    {
      host: "a.localhost",
      path: { match: "/api/*", strip: true },
      target: { service: "api", port: 4000 },
    },
  ], undefined);

  assertEquals(conf.includes("handle_path /api/* {"), true);
  assertEquals(conf.includes("reverse_proxy http://api:4000"), true);
  assertEquals(conf.includes("handle /api/*"), false);
});

Deno.test("caddyfile: { match, strip: false } behaves exactly like a plain string path", () => {
  const withFalse = caddyfile([
    {
      host: "a.localhost",
      path: { match: "/x*", strip: false },
      target: { service: "x", port: 1 },
    },
  ], undefined);
  const plain = caddyfile([
    { host: "a.localhost", path: "/x*", target: { service: "x", port: 1 } },
  ], undefined);

  assertEquals(withFalse, plain);
});

Deno.test("caddyfile: routes are grouped into one site block per distinct host, in first-seen order", () => {
  const conf = caddyfile([
    { host: "b.localhost", path: "/1", target: { service: "one", port: 1 } },
    { host: "a.localhost", path: "/2", target: { service: "two", port: 2 } },
    { host: "b.localhost", path: "/3", target: { service: "three", port: 3 } },
  ], undefined);

  const bIndex = conf.indexOf("b.localhost {");
  const aIndex = conf.indexOf("a.localhost {");
  assertEquals(bIndex > -1 && aIndex > bIndex, true);
  assertEquals(conf.match(/b\.localhost/g)?.length, 1);
  assertEquals(conf.includes("handle /1 {"), true);
  assertEquals(conf.includes("handle /3 {"), true);
});

Deno.test("caddyfile: tls internal reaches every site block, and the site address stays a bare host so Caddy serves HTTPS for it", () => {
  const conf = caddyfile([
    { host: "a.localhost", path: "/", target: { service: "web", port: 8000 } },
    { host: "b.localhost", path: "/", target: { service: "two", port: 8001 } },
  ], "internal");

  assertEquals(conf.includes("a.localhost {\n\ttls internal\n"), true);
  assertEquals(conf.includes("b.localhost {\n\ttls internal\n"), true);
  assertEquals(conf.match(/tls internal/g)?.length, 2);
  // The site address, not the upstreams, which legitimately carry a scheme.
  assertEquals(conf.includes("http://a.localhost"), false);
  assertEquals(conf.includes("http://b.localhost"), false);
});

Deno.test("caddyfile: without tls the site address is explicitly http, so Caddy never attempts automatic HTTPS", () => {
  const conf = caddyfile([
    { host: "a.localhost", path: "/", target: { service: "web", port: 8000 } },
  ], undefined);

  assertEquals(conf.startsWith("http://a.localhost {"), true);
  assertEquals(conf.includes("tls internal"), false);
});

Deno.test("caddyfile: a route with no host falls back to the :80 catch-all site address", () => {
  const conf = caddyfile([
    { host: "", path: "/", target: { service: "web", port: 8000 } },
  ], undefined);

  assertEquals(conf.startsWith(":80 {"), true);
});
