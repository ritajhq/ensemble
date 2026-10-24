import { assertEquals } from "@std/assert";
import { gatewayEntrypoints, proxiedEntrypoints } from "./gateway.ts";

Deno.test("gatewayEntrypoints: one entry per service and host, collecting every path routed there in declaration order", () => {
  const entrypoints = gatewayEntrypoints([
    {
      host: "a.localhost",
      path: "/api/*",
      target: { service: "api", port: 4000 },
    },
    { host: "a.localhost", path: "/*", target: { service: "web", port: 3000 } },
    {
      host: "a.localhost",
      path: { match: "/rpc/*", strip: true },
      target: { service: "api", port: 4000 },
    },
    { host: "b.localhost", path: "/*", target: { service: "api", port: 4000 } },
  ], "internal");

  assertEquals(entrypoints, [
    {
      service: "api",
      url: "https://a.localhost:8443",
      paths: ["/api/*", "/rpc/*"],
    },
    { service: "web", url: "https://a.localhost:8443", paths: ["/*"] },
    { service: "api", url: "https://b.localhost:8443", paths: ["/*"] },
  ]);
});

Deno.test("gatewayEntrypoints: plain HTTP leaves the default port out, and a route with no host is reached as localhost", () => {
  const entrypoints = gatewayEntrypoints([
    { host: "", path: "/*", target: { service: "web", port: 3000 } },
  ], "none");

  assertEquals(entrypoints, [
    { service: "web", url: "http://localhost", paths: ["/*"] },
  ]);
});

Deno.test("proxiedEntrypoints: HTTPS on the proxy's port, a link per host, none for a wildcard or a catch-all", () => {
  const target = { service: "router", port: 80 };
  assertEquals(
    proxiedEntrypoints([
      { host: "platform.lvh.me", path: "/*", target },
      { host: "*.lvh.me", path: "/*", target },
      { host: "", path: "/*", target },
    ]),
    [{ service: "router", url: "https://platform.lvh.me", paths: ["/*"] }],
  );
});
