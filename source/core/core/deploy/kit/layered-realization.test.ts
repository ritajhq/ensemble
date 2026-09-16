import { assertEquals } from "@std/assert";
import { FakeRealization } from "../resolve/test-fakes.ts";
import { LayeredRealization } from "./layered-realization.ts";
import type { TargetValuesConfig } from "./config.ts";

Deno.test("LayeredRealization: falls through to the underlying realization with no overrides", () => {
  const underlying = new FakeRealization()
    .withDefault("databases", "relational", "backupRetention", 7)
    .withBound("databases", "relational", "read-replicas", { max: 5 })
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { backupRetention: 35 },
    })
    .withCapability("databases", "relational", "read-replicas", true);
  const layered = new LayeredRealization({}, underlying);

  assertEquals(
    layered.defaultFor("databases", "relational", "backupRetention"),
    7,
  );
  assertEquals(layered.boundFor("databases", "relational", "read-replicas"), {
    max: 5,
  });
  assertEquals(layered.classPreset("databases", "relational", "critical"), {
    concernValues: { backupRetention: 35 },
  });
  assertEquals(
    layered.supportsCapability("databases", "relational", "read-replicas"),
    true,
  );
});

Deno.test("LayeredRealization: an overridden bound wins over the underlying kit's bound", () => {
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

  assertEquals(layered.boundFor("databases", "relational", "read-replicas"), {
    max: 2,
  });
});

Deno.test("LayeredRealization: an overridden default wins over the underlying kit's default", () => {
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
    layered.defaultFor("databases", "relational", "backupRetention"),
    14,
  );
});

Deno.test("LayeredRealization: an overridden class preset replaces the underlying preset entirely", () => {
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

  assertEquals(layered.classPreset("databases", "relational", "critical"), {
    concernValues: { backupRetention: 14 },
  });
});

Deno.test("LayeredRealization: a class not overridden falls through untouched", () => {
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

  assertEquals(layered.classPreset("databases", "relational", "standard"), {
    concernValues: { backupRetention: 7 },
  });
});

Deno.test("LayeredRealization: capability support and output knowability always pass through", () => {
  const underlying = new FakeRealization().withCapability(
    "databases",
    "relational",
    "read-replicas",
    true,
  );
  const layered = new LayeredRealization({}, underlying);

  assertEquals(
    layered.supportsCapability("databases", "relational", "read-replicas"),
    true,
  );
  assertEquals(
    layered.knowabilityOf("databases", "relational", "host"),
    "static",
  );
});
