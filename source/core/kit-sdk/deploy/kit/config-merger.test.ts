import { assertEquals } from "@std/assert";
import type { KitConfig } from "./config.ts";
import { KitConfigMerger } from "./config-merger.ts";

const merger = new KitConfigMerger();

function config(overrides: Partial<KitConfig>): KitConfig {
  return {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
    ...overrides,
  };
}

Deno.test("KitConfigMerger.merge: a later layer's behavior key wins a conflict", () => {
  const base = config({ behavior: { logLevel: "info", region: "us-east-1" } });
  const override = config({ behavior: { logLevel: "debug" } });

  const merged = merger.merge([base, override]);
  assertEquals(merged.behavior, { logLevel: "debug", region: "us-east-1" });
});

Deno.test("KitConfigMerger.merge: provisioner catalogs concatenate with the later layer's entries tried first", () => {
  const base = config({
    provisionerCatalog: {
      provisioners: [{
        type: "relational",
        implementation: { kind: "command", command: "base" },
      }],
    },
  });
  const override = config({
    provisionerCatalog: {
      provisioners: [{
        type: "relational",
        implementation: { kind: "command", command: "project-shadow" },
      }],
    },
  });

  const merged = merger.merge([base, override]);
  assertEquals(
    merged.provisionerCatalog.provisioners.map((p) => p.implementation),
    [
      { kind: "command", command: "project-shadow" },
      { kind: "command", command: "base" },
    ],
  );
});

Deno.test("KitConfigMerger.merge: a later layer's bound for the same category.type/concern wins a conflict", () => {
  const base = config({
    targetValues: {
      "databases.relational": { bounds: { "read-replicas": { max: 5 } } },
    },
  });
  const override = config({
    targetValues: {
      "databases.relational": { bounds: { "read-replicas": { max: 2 } } },
    },
  });

  const merged = merger.merge([base, override]);
  assertEquals(merged.targetValues["databases.relational"].bounds, {
    "read-replicas": { max: 2 },
  });
});

Deno.test("KitConfigMerger.merge: overriding one concern's bound doesn't clobber another concern's bound on the same type", () => {
  const base = config({
    targetValues: {
      "databases.relational": {
        bounds: { "read-replicas": { max: 5 }, backupRetention: { max: 35 } },
      },
    },
  });
  const override = config({
    targetValues: {
      "databases.relational": { bounds: { "read-replicas": { max: 2 } } },
    },
  });

  const merged = merger.merge([base, override]);
  assertEquals(merged.targetValues["databases.relational"].bounds, {
    "read-replicas": { max: 2 },
    backupRetention: { max: 35 },
  });
});

Deno.test("KitConfigMerger.merge: overriding one class's preset doesn't clobber another class's preset on the same type", () => {
  const base = config({
    targetValues: {
      "databases.relational": {
        classPresets: {
          critical: { backupRetention: 35 },
          standard: { backupRetention: 7 },
        },
      },
    },
  });
  const override = config({
    targetValues: {
      "databases.relational": {
        classPresets: { critical: { backupRetention: 14 } },
      },
    },
  });

  const merged = merger.merge([base, override]);
  assertEquals(merged.targetValues["databases.relational"].classPresets, {
    critical: { backupRetention: 14 },
    standard: { backupRetention: 7 },
  });
});

Deno.test("KitConfigMerger.merge: an empty layer list produces an empty effective config", () => {
  assertEquals(merger.merge([]), {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
  });
});
