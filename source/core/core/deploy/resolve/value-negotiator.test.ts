import { assertEquals, assertRejects } from "@std/assert";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import type { MatchedResource } from "./matched-resource.ts";
import { EngineNotProvidedError, ValueNegotiator } from "./value-negotiator.ts";
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

Deno.test("ValueNegotiator.negotiate: falls back to the platform default with no class or capability", async () => {
  const realization = new FakeRealization().withDefault(
    "databases",
    "relational",
    "backupRetention",
    7,
  );
  const target = fakeTarget(
    new FakeKit([new FakeProvisioner(() => true)], realization),
  );

  const resolved = await negotiator.negotiate(matchedRelational(), target);
  assertEquals(resolved.values.backupRetention, {
    value: 7,
    provenance: "default",
  });
  assertEquals(resolved.warnings, []);
});

Deno.test("ValueNegotiator.negotiate: a class preset outranks the platform default", async () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "backupRetention", 7)
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { backupRetention: 35 },
    });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(
    matchedRelational({ class: "critical" }),
    target,
  );
  assertEquals(resolved.values.backupRetention, {
    value: 35,
    provenance: "preset",
  });
});

Deno.test("ValueNegotiator.negotiate: a developer capability outranks both the class preset and the default", async () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "read-replicas", 0)
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { "read-replicas": 1 },
    });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(
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

Deno.test("ValueNegotiator.negotiate: clamps a value that exceeds the platform bound and warns", async () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "read-replicas", 0)
    .withBound("databases", "relational", "read-replicas", { max: 2 });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(
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

Deno.test("ValueNegotiator.negotiate: clamps below the platform's minimum bound too", async () => {
  const realization = new FakeRealization().withBound(
    "databases",
    "relational",
    "backupRetention",
    { min: 7 },
  );
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(
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

Deno.test("ValueNegotiator.negotiate: never clamps a boolean-valued concern", async () => {
  const realization = new FakeRealization()
    .withClassPreset("databases", "relational", "critical", {
      concernValues: { multiAz: true },
    })
    .withBound("databases", "relational", "multiAz", { max: 0 });
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(
    matchedRelational({ class: "critical" }),
    target,
  );
  assertEquals(resolved.values.multiAz, { value: true, provenance: "preset" });
});

Deno.test("ValueNegotiator.negotiate: a concern with no preset, default, or capability is simply absent — the declaration's own pin apart", async () => {
  const realization = new FakeRealization();
  const target = fakeTarget(new FakeKit([], realization));

  const resolved = await negotiator.negotiate(matchedRelational(), target);
  assertEquals(resolved.values, {
    engine: { value: "postgres", provenance: "pin" },
  });
});

Deno.test("ValueNegotiator.negotiate: an unpinned engine is the kit's default, and a pin outranks it", async () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "engine", "mysql")
    .withEngines("databases", "relational", ["mysql", "postgres"]);
  const target = fakeTarget(new FakeKit([], realization));
  const unpinned = matchedRelational();
  const { engine: _, ...withoutEngine } = unpinned.declaration.params;

  const byDefault = await negotiator.negotiate({
    ...unpinned,
    declaration: { ...unpinned.declaration, params: withoutEngine },
  }, target);
  assertEquals(byDefault.values.engine, {
    value: "mysql",
    provenance: "default",
  });
  const pinned = await negotiator.negotiate(matchedRelational(), target);
  assertEquals(pinned.values.engine, { value: "postgres", provenance: "pin" });
});

Deno.test("ValueNegotiator.negotiate: a pin the kit doesn't provide is refused, naming what it does", async () => {
  const realization = new FakeRealization().withEngines(
    "databases",
    "relational",
    ["mysql"],
  );
  const target = fakeTarget(new FakeKit([], realization));

  await assertRejects(
    () => negotiator.negotiate(matchedRelational(), target),
    EngineNotProvidedError,
    `engine "postgres" isn't one this kit provides for relational (it provides: mysql)`,
  );
});

Deno.test("ValueNegotiator.negotiate: a kit that lists no engines takes a pin as written", async () => {
  const target = fakeTarget(new FakeKit([], new FakeRealization()));

  const resolved = await negotiator.negotiate(matchedRelational(), target);
  assertEquals(resolved.values.engine, {
    value: "postgres",
    provenance: "pin",
  });
});

Deno.test("ValueNegotiator.negotiate: a default engine the kit doesn't provide is refused too, pointing at the kit config that set it", async () => {
  const realization = new FakeRealization()
    .withDefault("databases", "relational", "engine", "oracle")
    .withEngines("databases", "relational", ["postgres"]);
  const target = fakeTarget(new FakeKit([], realization));
  const unpinned = matchedRelational();
  const { engine: _, ...withoutEngine } = unpinned.declaration.params;

  await assertRejects(
    () =>
      negotiator.negotiate({
        ...unpinned,
        declaration: { ...unpinned.declaration, params: withoutEngine },
      }, target),
    EngineNotProvidedError,
    "set as the default in this kit's config",
  );
});
