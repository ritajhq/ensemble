import { assertEquals } from "@std/assert";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import type { MatchedResource } from "./matched-resource.ts";
import { ValueNegotiator } from "./value-negotiator.ts";
import {
  FakeKit,
  FakeProvisioner,
  FakeRealization,
  fakeTarget,
} from "./test-fakes.ts";

function matchedRelational(
  overrides: Partial<MatchedResource["declaration"]> = {},
): MatchedResource {
  return {
    category: "databases",
    name: "primary",
    contract: relationalV1,
    declaration: {
      type: "relational",
      params: {
        engine: "postgres",
        version: "16",
        user: "appuser",
        database: "appdb",
        passwordSecret: "db-password",
      },
      ...overrides,
    },
  };
}

const negotiator = new ValueNegotiator();

Deno.test("ValueNegotiator.negotiate: falls back to the platform default with no class or capability", () => {
  const realization = new FakeRealization().withDefault(
    "databases",
    "relational",
    "backupRetention",
    7,
  );
  const target = fakeTarget(
    new FakeKit([new FakeProvisioner(() => true)], realization),
  );

  const resolved = negotiator.negotiate(matchedRelational(), target);
  assertEquals(resolved.values.backupRetention, {
    value: 7,
    provenance: "default",
  });
  assertEquals(resolved.warnings, []);
});

Deno.test("ValueNegotiator.negotiate: a class preset outranks the platform default", () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "backupRetention", 7)
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { backupRetention: 35 },
    });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(
    matchedRelational({ class: "critical" }),
    target,
  );
  assertEquals(resolved.values.backupRetention, {
    value: 35,
    provenance: "preset",
  });
});

Deno.test("ValueNegotiator.negotiate: a developer capability outranks both the class preset and the default", () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "read-replicas", 0)
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { "read-replicas": 1 },
    });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(
    matchedRelational({
      class: "critical",
      capabilities: { "read-replicas": 3 },
    }),
    target,
  );
  assertEquals(resolved.values["read-replicas"], {
    value: 3,
    provenance: "capability",
  });
});

Deno.test("ValueNegotiator.negotiate: clamps a value that exceeds the platform bound and warns", () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "read-replicas", 0)
    .withBound("databases", "relational", "read-replicas", { max: 2 });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(
    matchedRelational({ capabilities: { "read-replicas": 5 } }),
    target,
  );
  assertEquals(resolved.values["read-replicas"], {
    value: 2,
    provenance: "clamp",
  });
  assertEquals(resolved.warnings, [
    'databases.primary: "read-replicas" clamped from 5 to 2 (platform bound).',
  ]);
});

Deno.test("ValueNegotiator.negotiate: clamps below the platform's minimum bound too", () => {
  const realization = new FakeRealization().withBound(
    "databases",
    "relational",
    "backupRetention",
    { min: 7 },
  );
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(
    matchedRelational({
      capabilities: { backupRetention: 1 as unknown as number },
    }),
    target,
  );
  assertEquals(resolved.values.backupRetention, {
    value: 7,
    provenance: "clamp",
  });
});

Deno.test("ValueNegotiator.negotiate: never clamps a boolean-valued concern", () => {
  const realization = new FakeRealization()
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { multiAz: true },
    })
    .withBound("databases", "relational", "multiAz", { max: 0 });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(
    matchedRelational({ class: "critical" }),
    target,
  );
  assertEquals(resolved.values.multiAz, { value: true, provenance: "preset" });
});

Deno.test("ValueNegotiator.negotiate: a concern with no preset, default, or capability is simply absent", () => {
  const realization = new FakeRealization();
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = negotiator.negotiate(matchedRelational(), target);
  assertEquals(resolved.values, {});
});
