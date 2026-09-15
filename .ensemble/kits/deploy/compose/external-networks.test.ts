import { assertEquals, assertThrows } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { externalNetworkEmulations } from "./external-networks.ts";

Deno.test("externalNetworkEmulations: a network-typed external becomes a docker network inspect/create pair", () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { "edge-net": { type: "network", name: "edge-net" } },
  };

  assertEquals(externalNetworkEmulations(workload), [{
    name: "edge-net",
    check: ["docker", "network", "inspect", "edge-net"],
    create: ["docker", "network", "create", "edge-net"],
  }]);
});

Deno.test("externalNetworkEmulations: the manifest key and the network's own name can differ", () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { edge: { type: "network", name: "prod-edge-net" } },
  };

  assertEquals(externalNetworkEmulations(workload), [{
    name: "edge",
    check: ["docker", "network", "inspect", "prod-edge-net"],
    create: ["docker", "network", "create", "prod-edge-net"],
  }]);
});

Deno.test("externalNetworkEmulations: no external entries emulates nothing", () => {
  assertEquals(externalNetworkEmulations({}), []);
});

Deno.test("externalNetworkEmulations: throws on an external type compose doesn't know how to emulate", () => {
  const workload: KitSdk.Deploy.Workload = {
    external: { db: { type: "database", name: "shared-db" } },
  };

  const error = assertThrows(() => externalNetworkEmulations(workload), Error);
  assertEquals(
    error.message,
    'The compose kit only knows how to emulate "network"-typed externals ("external.db" is "database").',
  );
});
