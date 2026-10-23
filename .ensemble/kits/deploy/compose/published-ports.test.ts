import { assertEquals, assertRejects } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { containerProvisioner } from "./provisioners/container.ts";

async function hostPorts(
  params: Record<string, unknown>,
  mode: KitSdk.Deploy.Mode,
): Promise<string[] | undefined> {
  const outcome = await containerProvisioner().provision!({
    category: "compute",
    name: "router",
    type: "container",
    params: { image: "router:dev", ...params },
    values: {},
    secrets: {},
    mode,
  });
  return (outcome.fragment.content as { service: { ports?: string[] } })
    .service.ports;
}

Deno.test("compose kit: a published compute port is mapped to its host port under ens deploy, where nothing else is published", async () => {
  assertEquals(
    await hostPorts(
      { ports: { https: 443 }, publish: { https: 443 } },
      "deployment",
    ),
    ["443:443"],
  );
});

Deno.test("compose kit: a published port takes the host port the manifest names, a variable's string included", async () => {
  assertEquals(
    await hostPorts(
      { ports: { https: 443 }, publish: { https: "8443" } },
      "deployment",
    ),
    ["8443:443"],
  );
});

Deno.test("compose kit: under ens develop, a published port isn't also given an ephemeral mapping, but the others still are", async () => {
  assertEquals(
    await hostPorts({
      ports: { https: 443, metrics: 9100 },
      publish: { https: 443 },
    }, "development"),
    ["443:443", "9100"],
  );
});

Deno.test("compose kit: publishing a port the compute doesn't declare, or a host port out of range, is rejected", async () => {
  await assertRejects(
    () =>
      hostPorts({ ports: { https: 443 }, publish: { http: 80 } }, "deployment"),
    Error,
    'port "http"',
  );
  await assertRejects(
    () =>
      hostPorts(
        { ports: { https: 443 }, publish: { https: 70000 } },
        "deployment",
      ),
    Error,
    "between 1 and 65535",
  );
});
