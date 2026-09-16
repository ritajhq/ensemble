import { assertEquals } from "@std/assert";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import type { MatchedResource } from "./matched-resource.ts";
import type { ResolvedValues } from "./resolved-values.ts";
import { RequestAssembler } from "./request-assembler.ts";

const matched: MatchedResource = {
  category: "databases",
  name: "primary",
  contract: relationalV1,
  declaration: {
    type: "relational",
    class: "critical",
    params: {
      engine: "postgres",
      version: "16",
      user: "appuser",
      database: "appdb",
      passwordSecret: "db-password",
      url: "${databases.primary.url}",
    },
  },
};

const values: ResolvedValues = {
  values: { backupRetention: { value: 35, provenance: "preset" } },
  warnings: [],
};

const assembler = new RequestAssembler();

Deno.test("RequestAssembler.assemble: combines the matched resource and negotiated values", () => {
  const request = assembler.assemble(matched, values);
  assertEquals(request, {
    category: "databases",
    name: "primary",
    type: "relational",
    class: "critical",
    params: matched.declaration.params,
    values: values.values,
  });
});

Deno.test("RequestAssembler.assemble: leaves reference placeholders in params untouched", () => {
  const request = assembler.assemble(matched, values);
  assertEquals(request.params.url, "${databases.primary.url}");
});
