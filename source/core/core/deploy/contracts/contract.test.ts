import { assertEquals, assertThrows } from "@std/assert";
import type { ResourceDeclaration } from "../resource.ts";
import { ContractError } from "./errors.ts";
import { containerV1 } from "./seeds/container.ts";
import { relationalV1 } from "./seeds/relational.ts";
import { ManifestPath } from "../problem.ts";

const DB = ManifestPath.resource("databases", "db");
const API = ManifestPath.resource("compute", "api");

function validateRelational(resource: ResourceDeclaration): void {
  relationalV1.validate(resource, DB);
}

function validateContainer(resource: ResourceDeclaration): void {
  containerV1.validate(resource, API);
}

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
  validateRelational(relationalResource({ class: "critical" }));
});

Deno.test("ResourceContract.validate: rejects a missing required param", () => {
  const { database: _database, ...rest } = relationalResource().params;
  const error = assertThrows(
    () => validateRelational({ type: "relational", params: rest }),
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
      validateRelational(
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
      validateRelational(
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
    () => validateRelational(relationalResource({ class: "quantum" })),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.relational does not support class "quantum" (expected one of: ephemeral, standard, critical).',
  );
});

Deno.test("ResourceContract.validate: accepts a declared quantified capability", () => {
  validateRelational(
    relationalResource({ capabilities: { "read-replicas": 2 } }),
  );
});

Deno.test("ResourceContract.validate: rejects a quantified capability given as a boolean", () => {
  const error = assertThrows(
    () =>
      validateRelational(
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
      validateRelational(
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
  validateContainer({
    type: "container",
    params: {
      image: "${release.web}",
      replicas: 2,
      ports: { http: 8080 },
      env: { DATABASE_URL: "${databases.primary.url}" },
    },
  });
});

Deno.test("ResourceContract.validate: accepts a development block (Section 12's reserved watch seam) untouched", () => {
  validateContainer({
    type: "container",
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
      validateContainer({
        type: "container",
        params: { image: "web", replicas: 1, ports: "8080" },
      }),
    ContractError,
  );
  assertEquals(
    error.message,
    'compute.container param "ports" must be a object.',
  );
});

Deno.test("ResourceContract.validate: accepts a networks list of external references", () => {
  validateContainer({
    type: "container",
    params: {
      image: "web:latest",
      replicas: 1,
      networks: ["${external.edge-net.name}"],
    },
  });
});

Deno.test("ResourceContract.validate: rejects a non-array value for an array-typed param", () => {
  const error = assertThrows(
    () =>
      validateContainer({
        type: "container",
        params: { image: "web", replicas: 1, networks: "edge-net" },
      }),
    ContractError,
  );
  assertEquals(
    error.message,
    'compute.container param "networks" must be a array.',
  );
});

Deno.test("id: is category.type", () => {
  assertEquals(relationalV1.id, "databases.relational");
  assertEquals(containerV1.id, "compute.container");
});

Deno.test("ResourceContract.validate: a container takes no class", () => {
  assertThrows(
    () =>
      validateContainer({
        type: "container",
        class: "critical",
        params: { image: "x", replicas: 1 },
      }),
    ContractError,
    "compute.container takes no class.",
  );
});

Deno.test("ResourceContract.problemsOf: reports every violation, each at the field it's about", () => {
  const problems = relationalV1.problemsOf(
    {
      type: "relational",
      class: "quantum",
      params: { engine: 5, version: "16", user: "app", databse: "app" },
    },
    DB,
  );

  assertEquals(problems, [
    {
      path: ["deploy", "databases", "db", "databse"],
      message:
        'databases.relational has no param "databse". Did you mean "database"?',
    },
    {
      path: ["deploy", "databases", "db", "engine"],
      message: 'databases.relational param "engine" must be a string.',
    },
    {
      path: ["deploy", "databases", "db"],
      message: 'databases.relational requires param "database".',
    },
    {
      path: ["deploy", "databases", "db"],
      message: 'databases.relational requires param "passwordSecret".',
    },
    {
      path: ["deploy", "databases", "db", "class"],
      message:
        'databases.relational does not support class "quantum" (expected one of: ephemeral, standard, critical).',
    },
  ]);
});
