import { assertEquals, assertRejects } from "@std/assert";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import type { MatchedResource } from "./matched-resource.ts";
import { NoMatchingProvisionerError } from "./selected-provisioner.ts";
import { ProvisionerSelector } from "./provisioner-selector.ts";
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

const selector = new ProvisionerSelector();

Deno.test("ProvisionerSelector.select: first-match wins over a later matching provisioner", async () => {
  const first = new FakeProvisioner(() => true);
  const second = new FakeProvisioner(() => true);
  const kit = new FakeKit([first, second], new FakeRealization());

  const selected = await selector.select(matchedRelational(), fakeTarget(kit));
  assertEquals(selected.provisioner, first);
});

Deno.test("ProvisionerSelector.select: skips a non-matching provisioner to reach a later match", async () => {
  const skip = new FakeProvisioner(() => false);
  const match = new FakeProvisioner(() => true);
  const kit = new FakeKit([skip, match], new FakeRealization());

  const selected = await selector.select(matchedRelational(), fakeTarget(kit));
  assertEquals(selected.provisioner, match);
});

Deno.test("ProvisionerSelector.select: throws NoMatchingProvisionerError when nothing matches", async () => {
  const kit = new FakeKit(
    [new FakeProvisioner(() => false)],
    new FakeRealization(),
  );
  await assertRejects(
    () => selector.select(matchedRelational(), fakeTarget(kit)),
    NoMatchingProvisionerError,
  );
});

Deno.test("ProvisionerSelector.select: reports no gaps when every requested capability is supported", async () => {
  const realization = new FakeRealization().withCapability(
    "databases",
    "relational",
    "read-replicas",
    true,
  );
  const kit = new FakeKit([new FakeProvisioner(() => true)], realization);

  const selected = await selector.select(
    matchedRelational({ capabilities: { "read-replicas": 2 } }),
    fakeTarget(kit),
  );
  assertEquals(selected.gaps, []);
});

Deno.test("ProvisionerSelector.select: reports a gap for an unsupported capability without failing the match", async () => {
  const kit = new FakeKit(
    [new FakeProvisioner(() => true)],
    new FakeRealization(),
  );

  const selected = await selector.select(
    matchedRelational({ capabilities: { "read-replicas": 2 } }),
    fakeTarget(kit),
  );
  assertEquals(selected.gaps, [{ capability: "read-replicas", requested: 2 }]);
});

Deno.test("ProvisionerSelector.explain: reports every provisioner's own match result, by its describe() label", async () => {
  const relational = new FakeProvisioner(
    (r) => r.declaration.type === "relational",
    "relational",
  );
  const containerOrchestrated = new FakeProvisioner(
    (r) => r.declaration.type === "container-orchestrated",
    "container-orchestrated",
  );
  const kit = new FakeKit(
    [containerOrchestrated, relational],
    new FakeRealization(),
  );

  const explanation = await selector.explain(matchedRelational(), fakeTarget(kit));
  assertEquals(explanation, [
    { description: "container-orchestrated", matched: false },
    { description: "relational", matched: true },
  ]);
});

Deno.test("ProvisionerSelector.explain: falls back to a positional label when a provisioner declares no describe()", async () => {
  const kit = new FakeKit(
    [new FakeProvisioner(() => true)],
    new FakeRealization(),
  );

  const explanation = await selector.explain(matchedRelational(), fakeTarget(kit));
  assertEquals(explanation, [{ description: "provisioner #1", matched: true }]);
});

Deno.test("ProvisionerSelector.explain: never throws when nothing matches (unlike select)", async () => {
  const kit = new FakeKit(
    [new FakeProvisioner(() => false, "relational")],
    new FakeRealization(),
  );

  const explanation = await selector.explain(matchedRelational(), fakeTarget(kit));
  assertEquals(explanation, [{ description: "relational", matched: false }]);
});

Deno.test("ProvisionerSelector.select: a runtime-guarded provisioner binds differently depending on the target's runtime", async () => {
  const localstack = new FakeProvisioner(
    (_r, runtime) => runtime === "localstack",
    "localstack-relational",
  );
  const real = new FakeProvisioner(
    (_r, runtime) => runtime !== "localstack",
    "real-relational",
  );
  const kit = new FakeKit([localstack, real], new FakeRealization());

  const onLocalstack = await selector.select(
    matchedRelational(),
    fakeTarget(kit, "localstack"),
  );
  const onReal = await selector.select(matchedRelational(), fakeTarget(kit));

  assertEquals(onLocalstack.provisioner, localstack);
  assertEquals(onReal.provisioner, real);
});

Deno.test("ProvisionerSelector.select: no target runtime means the provisioner sees runtime as undefined", async () => {
  let seenRuntime: string | undefined = "unset";
  const kit = new FakeKit(
    [
      new FakeProvisioner((_r, runtime) => {
        seenRuntime = runtime;
        return true;
      }),
    ],
    new FakeRealization(),
  );

  await selector.select(matchedRelational(), fakeTarget(kit));
  assertEquals(seenRuntime, undefined);
});
