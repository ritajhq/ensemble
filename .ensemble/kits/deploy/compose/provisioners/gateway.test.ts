import { assertEquals } from "@std/assert";
import {
  gatewayEntrypoints,
  gatewayProvisioner,
  proxiedEntrypoints,
} from "./gateway.ts";

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

async function gatewayPorts(
  params: Record<string, unknown>,
  development?: boolean,
): Promise<string[] | undefined> {
  const outcome = await gatewayProvisioner().provision!({
    category: "networking",
    name: "web",
    type: "gateway",
    params: { routes: [], ...params },
    values: {},
    secrets: {},
    ...(development === undefined ? {} : { development }),
  });
  return (outcome.fragment.content as { service: { ports?: string[] } })
    .service.ports;
}

Deno.test("gatewayProvisioner: a gateway nothing fronts publishes its listener on every interface in a deployment", async () => {
  assertEquals(await gatewayPorts({ tls: "internal" }), ["8443:443"]);
  assertEquals(await gatewayPorts({ tls: "none" }, false), ["80:80"]);
});

Deno.test("gatewayProvisioner: a development session binds the listener to loopback", async () => {
  assertEquals(await gatewayPorts({ tls: "internal" }, true), [
    "127.0.0.1:8443:443",
  ]);
  assertEquals(await gatewayPorts({ tls: "none" }, true), ["127.0.0.1:80:80"]);
});

Deno.test("gatewayProvisioner: a gateway on ingress networks publishes nothing, development or not", async () => {
  assertEquals(await gatewayPorts({ networks: ["edge"] }, true), undefined);
});
