import { assertEquals, assertRejects } from "@std/assert";
import { containerProvisioner } from "./provisioners/container.ts";

async function hostPorts(
  params: Record<string, unknown>,
): Promise<string[] | undefined> {
  const outcome = await containerProvisioner().provision!({
    category: "compute",
    name: "router",
    type: "container",
    params: { image: "router:dev", ...params },
    values: {},
    secrets: {},
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
