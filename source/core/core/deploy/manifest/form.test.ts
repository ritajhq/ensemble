import { assertEquals } from "@std/assert";
import { Parser } from "./parser.ts";
import { manifestForm } from "./form.ts";

const parser = new Parser();

Deno.test("manifestForm: a manifest with no deploy block yields no fields", () => {
  const workload = parser.parse(`version: v1`);
  assertEquals(manifestForm(workload), []);
});

Deno.test("manifestForm: one field per variable, in declaration order, with type and default carried through", () => {
  const workload = parser.parse(`
version: v1
deploy:
  variables:
    domain: {}
    gateway_networks: { type: list }
    frontend_base_url: { default: "http://localhost:3000" }
`);
  assertEquals(manifestForm(workload), [
    { name: "domain", kind: "variable", type: undefined, default: undefined },
    {
      name: "gateway_networks",
      kind: "variable",
      type: "list",
      default: undefined,
    },
    {
      name: "frontend_base_url",
      kind: "variable",
      type: undefined,
      default: "http://localhost:3000",
    },
  ]);
});

Deno.test("manifestForm: one field per secret, carrying no value or default", () => {
  const workload = parser.parse(`
version: v1
deploy:
  secrets:
    pgpassword: { source: environment }
    bucket_access_key: { source: environment }
`);
  assertEquals(manifestForm(workload), [
    { name: "pgpassword", kind: "secret" },
    { name: "bucket_access_key", kind: "secret" },
  ]);
});

Deno.test("manifestForm: variables are listed before secrets regardless of manifest order", () => {
  const workload = parser.parse(`
version: v1
deploy:
  secrets:
    pgpassword: { source: environment }
  variables:
    domain: {}
`);
  assertEquals(manifestForm(workload), [
    { name: "domain", kind: "variable", type: undefined, default: undefined },
    { name: "pgpassword", kind: "secret" },
  ]);
});
