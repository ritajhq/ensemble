import { assertEquals, assertThrows } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ContractError } from "./errors.ts";
import { ContractCatalog } from "./registry.ts";
import { ReferenceValidator } from "./reference-validator.ts";
import { containerOrchestratedV1 } from "./seeds/container-orchestrated.ts";
import { relationalV1 } from "./seeds/relational.ts";

const parser = new Parser();
const registry = new ContractCatalog([relationalV1, containerOrchestratedV1]);
const validator = new ReferenceValidator(registry);

const APPENDIX_A = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 2
      ports: { http: 8080 }
      env:
        DATABASE_URL: \${databases.primary.url}
  databases:
    primary:
      type: relational
      class: critical
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`;

Deno.test("ReferenceValidator: accepts Appendix A's worked example", () => {
  validator.validate(parser.parse(APPENDIX_A));
});

Deno.test("ReferenceValidator: rejects a reference to an undeclared output", () => {
  const workload = parser.parse(
    APPENDIX_A.replace("databases.primary.url", "databases.primary.password"),
  );
  const error = assertThrows(() => validator.validate(workload), ContractError);
  assertEquals(
    error.message,
    'compute.api.env.DATABASE_URL references undeclared output "password" on databases.relational (declared outputs: host, port, user, database, url).',
  );
});

Deno.test("ReferenceValidator: rejects a reference to a resource that doesn't exist", () => {
  const workload = parser.parse(
    APPENDIX_A.replace("databases.primary.url", "databases.replica.url"),
  );
  const error = assertThrows(() => validator.validate(workload), ContractError);
  assertEquals(
    error.message,
    'compute.api.env.DATABASE_URL references undeclared resource "databases.replica".',
  );
});

Deno.test("ReferenceValidator: rejects a reference to an undeclared release", () => {
  const workload = parser.parse(
    APPENDIX_A.replace("release.web", "release.worker"),
  );
  const error = assertThrows(() => validator.validate(workload), ContractError);
  assertEquals(
    error.message,
    'compute.api.image references undeclared release "worker".',
  );
});

Deno.test("ReferenceValidator: accepts a reference to a compute's own declared port", () => {
  const workload = parser.parse(`
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      ports: { http: 8080 }
  networking:
    lb:
      type: load-balancer
      target: \${compute.api.http}
`);
  validator.validate(workload);
});

Deno.test("ReferenceValidator: rejects a reference to a port the target compute doesn't declare", () => {
  const workload = parser.parse(`
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      ports: { http: 8080 }
  networking:
    lb:
      type: load-balancer
      target: \${compute.api.grpc}
`);
  const error = assertThrows(() => validator.validate(workload), ContractError);
  assertEquals(
    error.message,
    'networking.lb.target references undeclared output "grpc" on compute.container-orchestrated (declared outputs: none).',
  );
});
