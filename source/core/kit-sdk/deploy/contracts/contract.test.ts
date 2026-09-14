import { assertEquals, assertThrows } from "@std/assert";
import type { ResourceDeclaration } from "../resource.ts";
import { ContractError } from "./errors.ts";
import { containerOrchestratedV1 } from "./seeds/container-orchestrated.ts";
import { relationalV1 } from "./seeds/relational.ts";

function relationalResource(
  overrides: Partial<ResourceDeclaration> = {},
): ResourceDeclaration {
  return {
    type: "relational",
    params: {
      engine: "postgres",
      version: "16",
      user: "appuser",
      database: "appdb",
      passwordSecret: "db-password",
    },
    ...overrides,
  };
}

Deno.test("ResourceContract.validate: accepts Appendix A's relational resource as-is", () => {
  relationalV1.validate(relationalResource({ class: "critical" }));
});

Deno.test("ResourceContract.validate: rejects a missing required param", () => {
  const { database: _database, ...rest } = relationalResource().params;
  const error = assertThrows(
    () => relationalV1.validate({ type: "relational", params: rest }),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational requires param "database".',
  );
});

Deno.test("ResourceContract.validate: rejects an unknown param with a near-miss suggestion", () => {
  const error = assertThrows(
    () =>
      relationalV1.validate(
        relationalResource({
          params: { ...relationalResource().params, databse: "appdb" },
        }),
      ),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational has no param "databse". Did you mean "database"?',
  );
});

Deno.test("ResourceContract.validate: rejects a param of the wrong scalar type", () => {
  const error = assertThrows(
    () =>
      relationalV1.validate(
        relationalResource({
          params: { ...relationalResource().params, engine: 5 },
        }),
      ),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational param "engine" must be a string.',
  );
});

Deno.test("ResourceContract.validate: rejects an unsupported class", () => {
  const error = assertThrows(
    () => relationalV1.validate(relationalResource({ class: "quantum" })),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational does not support class "quantum" (expected one of: ephemeral, standard, critical).',
  );
});

Deno.test("ResourceContract.validate: accepts a declared quantified capability", () => {
  relationalV1.validate(
    relationalResource({ capabilities: { "read-replicas": 2 } }),
  );
});

Deno.test("ResourceContract.validate: rejects a quantified capability given as a boolean", () => {
  const error = assertThrows(
    () =>
      relationalV1.validate(
        relationalResource({
          capabilities: { "read-replicas": true as unknown as number },
        }),
      ),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational capability "read-replicas" must be a number.',
  );
});

Deno.test("ResourceContract.validate: rejects an undeclared capability", () => {
  const error = assertThrows(
    () =>
      relationalV1.validate(
        relationalResource({ capabilities: { ordering: true } }),
      ),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational has no capability "ordering".',
  );
});

Deno.test("ResourceContract.validate: accepts Appendix A's compute resource, params passed through as opaque objects", () => {
  containerOrchestratedV1.validate({
    type: "container-orchestrated",
    params: {
      image: "${release.web}",
      replicas: 2,
      ports: { http: 8080 },
      env: { DATABASE_URL: "${databases.primary.url}" },
    },
  });
});

Deno.test("ResourceContract.validate: accepts a development block (Section 12's reserved watch seam) untouched", () => {
  containerOrchestratedV1.validate({
    type: "container-orchestrated",
    params: {
      image: "web:latest",
      replicas: 1,
      development: { sync: [{ app: "website/server", path: "/app/server" }] },
    },
  });
});

Deno.test("ResourceContract.validate: rejects a non-object value for an object-typed param", () => {
  const error = assertThrows(
    () =>
      containerOrchestratedV1.validate({
        type: "container-orchestrated",
        params: { image: "web", replicas: 1, ports: "8080" },
      }),
    ContractError,
  );
  assertEquals(
    error.message,
    'compute.container-orchestrated param "ports" must be a object.',
  );
});

Deno.test("id: is category.type", () => {
  assertEquals(relationalV1.id, "databases.relational");
  assertEquals(containerOrchestratedV1.id, "compute.container-orchestrated");
});
