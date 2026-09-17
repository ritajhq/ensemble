import { assertEquals } from "@std/assert";
import { FakeRealization } from "../resolve/test-fakes.ts";
import { LayeredRealization } from "./layered-realization.ts";
import type { TargetValuesConfig } from "./config.ts";

Deno.test("LayeredRealization: falls through to the underlying realization with no overrides", async () => {
  const underlying = new FakeRealization()
    .withDefault("databases", "relational", "backupRetention", 7)
    .withBound("databases", "relational", "read-replicas", { max: 5 })
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { backupRetention: 35 },
    })
    .withCapability("databases", "relational", "read-replicas", true);
  const layered = new LayeredRealization({}, underlying);

  assertEquals(
    await layered.defaultFor("databases", "relational", "backupRetention"),
    7,
  );
  assertEquals(
    await layered.boundFor("databases", "relational", "read-replicas"),
    { max: 5 },
  );
  assertEquals(
    await layered.classPreset("databases", "relational", "critical"),
    { concernValues: { backupRetention: 35 } },
  );
  assertEquals(
    await layered.supportsCapability("databases", "relational", "read-replicas"),
    true,
  );
});

Deno.test("LayeredRealization: an overridden bound wins over the underlying kit's bound", async () => {
  const underlying = new FakeRealization().withBound(
    "databases",
    "relational",
    "read-replicas",
    { max: 5 },
  );
  const overrides: TargetValuesConfig = {
    "databases.relational": { bounds: { "read-replicas": { max: 2 } } },
  };
  const layered = new LayeredRealization(overrides, underlying);

  assertEquals(
    await layered.boundFor("databases", "relational", "read-replicas"),
    { max: 2 },
  );
});

Deno.test("LayeredRealization: an overridden default wins over the underlying kit's default", async () => {
  const underlying = new FakeRealization().withDefault(
    "databases",
    "relational",
    "backupRetention",
    7,
  );
  const overrides: TargetValuesConfig = {
    "databases.relational": { defaults: { backupRetention: 14 } },
  };
  const layered = new LayeredRealization(overrides, underlying);

  assertEquals(
    await layered.defaultFor("databases", "relational", "backupRetention"),
    14,
  );
});

Deno.test("LayeredRealization: an overridden class preset replaces the underlying preset entirely", async () => {
  const underlying = new FakeRealization().withClassPreset(
    "databases",
    "relational",
    "critical",
    {
      concernValues: { backupRetention: 35, multiAz: true },
    },
  );
  const overrides: TargetValuesConfig = {
    "databases.relational": {
      classPresets: { critical: { backupRetention: 14 } },
    },
  };
  const layered = new LayeredRealization(overrides, underlying);

  assertEquals(
    await layered.classPreset("databases", "relational", "critical"),
    { concernValues: { backupRetention: 14 } },
  );
});

Deno.test("LayeredRealization: a class not overridden falls through untouched", async () => {
  const underlying = new FakeRealization().withClassPreset(
    "databases",
    "relational",
    "standard",
    {
      concernValues: { backupRetention: 7 },
    },
  );
  const overrides: TargetValuesConfig = {
    "databases.relational": {
      classPresets: { critical: { backupRetention: 14 } },
    },
  };
  const layered = new LayeredRealization(overrides, underlying);

  assertEquals(
    await layered.classPreset("databases", "relational", "standard"),
    { concernValues: { backupRetention: 7 } },
  );
});

Deno.test("LayeredRealization: capability support and output knowability always pass through", async () => {
  const underlying = new FakeRealization().withCapability(
    "databases",
    "relational",
    "read-replicas",
    true,
  );
  const layered = new LayeredRealization({}, underlying);

  assertEquals(
    await layered.supportsCapability("databases", "relational", "read-replicas"),
    true,
  );
  assertEquals(
    await layered.knowabilityOf("databases", "relational", "host"),
    "static",
  );
});
