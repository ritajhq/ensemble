import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Deploy from "./deploy/index.ts";
import { IngressFile, IngressRecorder } from "./ingress-record.ts";

const GATEWAY: Deploy.Render.Ingress = {
  service: "gateway",
  networks: ["ingress"],
  scheme: "http",
  port: 80,
  hosts: ["app.example.com", "admin.app.example.com"],
};

async function recorded(
  ingresses: readonly Deploy.Render.Ingress[] | undefined,
) {
  const dir = await Deno.makeTempDir();
  const file = IngressFile.for(dir, "web--feat-x", "compose");
  await new IngressRecorder(file, "repo-web--feat-x").record(
    new Deploy.Render.OutputsLedger(),
    join(dir, "compose.yaml"),
    { fragments: [], ...(ingresses ? { ingresses } : {}) },
  );
  return { dir, record: await file.read() };
}

Deno.test("IngressRecorder: an ingress the kit addresses by the deployment's own name is recorded under that name", async () => {
  const { record } = await recorded([GATEWAY]);
  assertEquals(record, {
    version: 1,
    deployment: "repo-web--feat-x",
    ingresses: [{ ...GATEWAY, alias: "repo-web--feat-x" }],
  });
});

Deno.test("IngressRecorder: an alias the manifest chose is kept as it is", async () => {
  const { record } = await recorded([{ ...GATEWAY, alias: "chosen" }]);
  assertEquals(record?.ingresses[0].alias, "chosen");
});

Deno.test("IngressRecorder: a deployment joining no network leaves an empty record, so a stale one never outlives it", async () => {
  const { record } = await recorded(undefined);
  assertEquals(record?.ingresses, []);
});

Deno.test("IngressFile: kept beside the task snapshot, per workload scope and kit", async () => {
  const { dir } = await recorded([GATEWAY]);
  const stat = await Deno.stat(
    join(dir, ".ensemble", "deploy", "web--feat-x", "compose.ingress.json"),
  );
  assertEquals(stat.isFile, true);
});

Deno.test("DeployedStates: tells every state, in order", async () => {
  const told: string[] = [];
  const state = (name: string): Deploy.Terminations.DeployedState => ({
    record: () => {
      told.push(name);
      return Promise.resolve();
    },
  });
  await new Deploy.Terminations.DeployedStates(state("a"), state("b")).record(
    new Deploy.Render.OutputsLedger(),
    "compose.yaml",
    { fragments: [] },
  );
  assertEquals(told, ["a", "b"]);
});
