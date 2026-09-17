import { assertEquals } from "@std/assert";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import type { MatchedResource } from "../resolve/matched-resource.ts";
import { ConfiguredProvisioner } from "./configured-provisioner.ts";

function resource(
  overrides: Partial<MatchedResource["declaration"]> = {},
): MatchedResource {
  return {
    category: "databases",
    name: "primary",
    contract: relationalV1,
    declaration: { type: "relational", params: {}, ...overrides },
  };
}

Deno.test("ConfiguredProvisioner.matches: matches on type alone when nothing else is declared", async () => {
  const provisioner = new ConfiguredProvisioner({
    type: "relational",
    implementation: { kind: "command", command: "x" },
  });
  assertEquals(await provisioner.matches(resource()), true);
});

Deno.test("ConfiguredProvisioner.matches: rejects a different type", async () => {
  const provisioner = new ConfiguredProvisioner({
    type: "key-value",
    implementation: { kind: "command", command: "x" },
  });
  assertEquals(await provisioner.matches(resource()), false);
});

Deno.test("ConfiguredProvisioner.matches: a declared class must match exactly", async () => {
  const provisioner = new ConfiguredProvisioner({
    type: "relational",
    class: "critical",
    implementation: { kind: "command", command: "x" },
  });
  assertEquals(await provisioner.matches(resource({ class: "critical" })), true);
  assertEquals(await provisioner.matches(resource({ class: "standard" })), false);
});

Deno.test("ConfiguredProvisioner.matches: a declared category must match the resource's category", async () => {
  const provisioner = new ConfiguredProvisioner({
    type: "relational",
    category: "storage",
    implementation: { kind: "command", command: "x" },
  });
  assertEquals(await provisioner.matches(resource()), false);
});

Deno.test("ConfiguredProvisioner.matches: requires every declared capability to be present, extras on the resource are fine", async () => {
  const provisioner = new ConfiguredProvisioner({
    type: "relational",
    capabilities: ["read-replicas"],
    implementation: { kind: "command", command: "x" },
  });
  assertEquals(
    await provisioner.matches(
      resource({ capabilities: { "read-replicas": 2, ordering: true } }),
    ),
    true,
  );
  assertEquals(
    await provisioner.matches(resource({ capabilities: { ordering: true } })),
    false,
  );
  assertEquals(await provisioner.matches(resource()), false);
});
