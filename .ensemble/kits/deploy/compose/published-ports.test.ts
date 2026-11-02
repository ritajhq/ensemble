import { assertEquals, assertRejects } from "@std/assert";
import { containerProvisioner } from "./provisioners/container.ts";

async function hostPorts(
  params: Record<string, unknown>,
  development?: boolean,
): Promise<string[] | undefined> {
  const outcome = await containerProvisioner().provision!({
    category: "compute",
    name: "router",
    type: "container",
    params: { image: "router:dev", ...params },
    values: {},
    secrets: {},
    ...(development === undefined ? {} : { development }),
  });
  return (outcome.fragment.content as { service: { ports?: string[] } })
    .service.ports;
}

Deno.test("compose kit: a published compute port is mapped to its host port, and nothing else is published", async () => {
  assertEquals(
    await hostPorts(
      { ports: { https: 443 }, publish: { https: 443 } },
    ),
    ["443:443"],
  );
});

Deno.test("compose kit: a published port takes the host port the manifest names, a variable's string included", async () => {
  assertEquals(
    await hostPorts(
      { ports: { https: 443 }, publish: { https: "8443" } },
    ),
    ["8443:443"],
  );
});

Deno.test("compose kit: publishing a port the compute doesn't declare, or a host port out of range, is rejected", async () => {
  await assertRejects(
    () => hostPorts({ ports: { https: 443 }, publish: { http: 80 } }),
    Error,
    'port "http"',
  );
  await assertRejects(
    () =>
      hostPorts(
        { ports: { https: 443 }, publish: { https: 70000 } },
      ),
    Error,
    "between 1 and 65535",
  );
});

Deno.test("compose kit: a development session binds a published port to loopback", async () => {
  assertEquals(
    await hostPorts(
      { ports: { https: 443 }, publish: { https: "8443" } },
      true,
    ),
    ["127.0.0.1:8443:443"],
  );
});

Deno.test("compose kit: a deployment keeps every interface, however it says so", async () => {
  const params = { ports: { https: 443 }, publish: { https: 8443 } };
  assertEquals(await hostPorts(params), ["8443:443"]);
  assertEquals(await hostPorts(params, false), ["8443:443"]);
});

Deno.test("compose kit: a development session publishes only what the manifest does", async () => {
  assertEquals(await hostPorts({ ports: { https: 443 } }, true), undefined);
});
