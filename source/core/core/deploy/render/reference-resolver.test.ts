import { assertEquals } from "@std/assert";
import { FakeRealization } from "../resolve/test-fakes.ts";
import { OutputsLedger } from "./outputs-ledger.ts";
import { ReferenceResolver } from "./reference-resolver.ts";

Deno.test("ReferenceResolver.resolve: bakes a static output's value", async () => {
  const realization = new FakeRealization(); // FakeRealization.knowabilityOf always returns "static"
  const ledger = new OutputsLedger();
  ledger.record("databases", "primary", "relational", {
    host: "primary",
    url: "postgres://...",
  });

  const resolver = new ReferenceResolver(realization);
  assertEquals(
    await resolver.resolve(
      { category: "databases", name: "primary", output: "url" },
      ledger,
    ),
    { mode: "baked", value: "postgres://..." },
  );
});

Deno.test("ReferenceResolver.resolve: defers to native wiring for a dynamic output", async () => {
  class DynamicRealization extends FakeRealization {
    override knowabilityOf() {
      return Promise.resolve("dynamic" as const);
    }
  }
  const ledger = new OutputsLedger();
  ledger.record("databases", "primary", "relational", {
    host: { "Fn::GetAtt": ["Primary", "Endpoint.Address"] },
  });

  const resolver = new ReferenceResolver(new DynamicRealization());
  assertEquals(
    await resolver.resolve(
      { category: "databases", name: "primary", output: "host" },
      ledger,
    ),
    {
      mode: "deferred",
      wiring: { "Fn::GetAtt": ["Primary", "Endpoint.Address"] },
    },
  );
});

Deno.test("ReferenceResolver.resolve: always bakes the release sugar", async () => {
  const ledger = new OutputsLedger();
  ledger.recordRelease("web", "ens-local/web:dev");

  const resolver = new ReferenceResolver(new FakeRealization());
  assertEquals(
    await resolver.resolve({ category: "release", name: "web" }, ledger),
    { mode: "baked", value: "ens-local/web:dev" },
  );
});
