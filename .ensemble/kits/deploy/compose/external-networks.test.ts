import { assertEquals, assertRejects } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { externalNetworkEmulations } from "./external-networks.ts";

Deno.test("externalNetworkEmulations: a network-typed external becomes a docker network inspect/create pair", async () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { "edge-net": { type: "network", name: "edge-net" } },
  };

  assertEquals(await externalNetworkEmulations(workload), [{
    name: "edge-net",
    check: ["docker", "network", "inspect", "edge-net"],
    create: ["docker", "network", "create", "edge-net"],
  }]);
});

Deno.test("externalNetworkEmulations: the manifest key and the network's own name can differ", async () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { edge: { type: "network", name: "prod-edge-net" } },
  };

  assertEquals(await externalNetworkEmulations(workload), [{
    name: "edge",
    check: ["docker", "network", "inspect", "prod-edge-net"],
    create: ["docker", "network", "create", "prod-edge-net"],
  }]);
});

Deno.test("externalNetworkEmulations: no external entries emulates nothing", async () => {
  assertEquals(await externalNetworkEmulations({}), []);
});

Deno.test("externalNetworkEmulations: throws on an external type compose doesn't know how to emulate", async () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { db: { type: "database", name: "shared-db" } },
  };

  await assertRejects(
    () => externalNetworkEmulations(workload),
    Error,
    'The compose kit only knows how to emulate "network"-typed externals ("external.db" is "database").',
  );
});
