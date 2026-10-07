import { assertEquals } from "@std/assert";
import * as KitSdk from "@ensemble/kit-sdk";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { objectStorageProvisioner } from "./provisioners/object-storage.ts";

const SECRETS: Record<string, KitSdk.Deploy.SecretDeclaration> = {
  "db-password": { source: "environment" },
  "bucket-access": { source: "environment" },
  "bucket-secret": { source: "environment" },
};

const REQUESTS: Record<string, {
  provisioner: KitSdk.Deploy.Provisioner;
  request: Omit<KitSdk.Deploy.ResolvedRequest, "mode">;
}> = {
  compute: {
    provisioner: containerOrchestratedProvisioner(),
    request: {
      category: "compute",
      name: "api",
      type: "container-orchestrated",
      params: { image: "api:dev", ports: { http: 4000, metrics: 9100 } },
      values: {},
      secrets: SECRETS,
    },
  },
  database: {
    provisioner: relationalProvisioner(),
    request: {
      category: "databases",
      name: "primary",
      type: "relational",
      params: {
        engine: "postgres",
        version: "16",
        user: "app",
        database: "app",
        passwordSecret: "db-password",
      },
      values: {},
      secrets: SECRETS,
    },
  },
  bucket: {
    provisioner: objectStorageProvisioner(),
    request: {
      category: "storage",
      name: "bucket",
      type: "object-storage",
      params: {
        bucket: "app",
        accessKeySecret: "bucket-access",
        secretKeySecret: "bucket-secret",
      },
      values: {},
      secrets: SECRETS,
    },
  },
};

async function publishedPorts(
  kind: string,
  mode: KitSdk.Deploy.Mode | undefined,
): Promise<string[] | undefined> {
  const { provisioner, request } = REQUESTS[kind];
  const outcome = await provisioner.provision!({ ...request, mode });
  const content = outcome.fragment.content as { service: { ports?: string[] } };
  return content.service.ports;
}

Deno.test("compose kit: under ens develop, every compute port is published on an ephemeral host port", async () => {
  assertEquals(await publishedPorts("compute", "development"), [
    "4000",
    "9100",
  ]);
});

Deno.test("compose kit: under ens develop, a database's and a bucket's own port are published on an ephemeral host port", async () => {
  assertEquals(await publishedPorts("database", "development"), ["5432"]);
  assertEquals(await publishedPorts("bucket", "development"), ["3900"]);
});

Deno.test("compose kit: under ens deploy — or a core that names no mode — nothing but the gateway reaches the host", async () => {
  for (const kind of Object.keys(REQUESTS)) {
    assertEquals(await publishedPorts(kind, "deployment"), undefined, kind);
    assertEquals(await publishedPorts(kind, undefined), undefined, kind);
  }
});
