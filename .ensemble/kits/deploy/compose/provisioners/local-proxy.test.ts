import { assertEquals, assertStringIncludes } from "@std/assert";
import { LocalProxy } from "./local-proxy.ts";

const router = { service: "router", port: 80 };

Deno.test("LocalProxy.labelsFor: every distinct host of the routes, terminated at the proxy and sent to the gateway's plain port", () => {
  const labels = new LocalProxy(["ingress"]).labelsFor([
    { host: "ensemble.lvh.me", path: "/*", target: router },
    { host: "*.ensemble.lvh.me", path: "/*", target: router },
    { host: "ensemble.lvh.me", path: "/api/*", target: router },
  ], "none");

  assertEquals(labels, {
    caddy: "ensemble.lvh.me, *.ensemble.lvh.me",
    "caddy.tls": "internal",
    "caddy.reverse_proxy": "{{upstreams 80}}",
  });
});

Deno.test("LocalProxy.labelsFor: a gateway serving HTTPS itself is asked over HTTPS without verifying its certificate", () => {
  const labels = new LocalProxy(["ingress"]).labelsFor([
    { host: "a.lvh.me", path: "/*", target: router },
  ], "internal");

  assertEquals(labels["caddy.reverse_proxy"], "{{upstreams https 443}}");
  assertEquals(labels["caddy.reverse_proxy.transport"], "http");
  assertEquals(
    labels["caddy.reverse_proxy.transport.tls_insecure_skip_verify"],
    "",
  );
});

Deno.test("LocalProxy.labelsFor: routes with no host have nothing to be matched by", () => {
  assertEquals(
    new LocalProxy(["ingress"]).labelsFor([
      { host: "", path: "/*", target: router },
    ], "none"),
    {},
  );
});

Deno.test("LocalProxy.startScript: joins each network the gateway is on, quoted, then restarts the proxy only if it joined one", () => {
  const script = new LocalProxy(["platform", "it's"]).startScript();

  assertStringIncludes(script, "for network in 'platform' 'it'\\''s'; do");
  assertStringIncludes(script, "docker network connect");
  assertStringIncludes(script, '[ -z "$changed" ] || docker restart');
});

Deno.test("LocalProxy.of: joins the networks of the services labelled for it, not the stack's own", () => {
  const proxy = LocalProxy.of({
    services: {
      gateway: {
        labels: { caddy: "a.lvh.me" },
        networks: { platform: { aliases: ["x"] }, default: null },
      },
      other: {
        labels: { caddy: "b.lvh.me" },
        networks: ["ingress", "default"],
      },
      database: { networks: ["private"] },
    },
  });

  assertEquals(proxy.isNeeded, true);
  assertStringIncludes(
    proxy.startScript(),
    "for network in 'platform' 'ingress'; do",
  );
});

Deno.test("LocalProxy.of: a stack with no labelled service needs no proxy", () => {
  assertEquals(LocalProxy.of({ services: { web: {} } }).isNeeded, false);
  assertEquals(LocalProxy.of({}).isNeeded, false);
});
