import { assertEquals, assertThrows } from "@std/assert";
import { OutputsLedger, OutputsLedgerError } from "./outputs-ledger.ts";

Deno.test("OutputsLedger: records and returns a resource's type and outputs", () => {
  const ledger = new OutputsLedger();
  ledger.record("databases", "primary", "relational", {
    host: "primary",
    port: 5432,
  });

  assertEquals(ledger.typeOf("databases", "primary"), "relational");
  assertEquals(ledger.outputFor("databases", "primary", "host"), "primary");
  assertEquals(ledger.outputFor("databases", "primary", "port"), 5432);
});

Deno.test("OutputsLedger: records and returns a compute's declared ports, separately from its contract outputs", () => {
  const ledger = new OutputsLedger();
  ledger.record("compute", "api", "container-orchestrated", {}, { http: 8080 });

  assertEquals(ledger.hasPort("compute", "api", "http"), true);
  assertEquals(ledger.portFor("compute", "api", "http"), 8080);
  assertEquals(ledger.hasPort("compute", "api", "grpc"), false);
});

Deno.test("OutputsLedger: a resource recorded with no ports has none", () => {
  const ledger = new OutputsLedger();
  ledger.record("databases", "primary", "relational", { host: "primary" });

  assertEquals(ledger.hasPort("databases", "primary", "host"), false);
});

Deno.test("OutputsLedger.portFor: throws for an undeclared port on a recorded resource", () => {
  const ledger = new OutputsLedger();
  ledger.record("compute", "api", "container-orchestrated", {}, { http: 8080 });
  assertThrows(
    () => ledger.portFor("compute", "api", "grpc"),
    OutputsLedgerError,
  );
});

Deno.test("OutputsLedger.portFor: throws for a resource that hasn't been rendered yet", () => {
  const ledger = new OutputsLedger();
  assertThrows(
    () => ledger.portFor("compute", "api", "http"),
    OutputsLedgerError,
  );
});

Deno.test("OutputsLedger: records and returns a release's located value", () => {
  const ledger = new OutputsLedger();
  ledger.recordRelease("web", "ens-local/web:dev");

  assertEquals(ledger.releaseOutput("web"), "ens-local/web:dev");
});

Deno.test("OutputsLedger.typeOf: throws for a resource that hasn't been rendered yet", () => {
  const ledger = new OutputsLedger();
  assertThrows(() => ledger.typeOf("databases", "primary"), OutputsLedgerError);
});

Deno.test("OutputsLedger.outputFor: throws for an unrecorded output on a recorded resource", () => {
  const ledger = new OutputsLedger();
  ledger.record("databases", "primary", "relational", { host: "primary" });
  assertThrows(
    () => ledger.outputFor("databases", "primary", "url"),
    OutputsLedgerError,
  );
});

Deno.test("OutputsLedger.releaseOutput: throws for a release that hasn't been rendered yet", () => {
  const ledger = new OutputsLedger();
  assertThrows(() => ledger.releaseOutput("web"), OutputsLedgerError);
});
