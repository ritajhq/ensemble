import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { DependencyGraphBuilder } from "../resolve/dependency-graph.ts";
import type { Release } from "../release.ts";
import {
  LocalArtifactsPacker,
  type ReleasePacker,
  ReleasePackError,
} from "./release-packer.ts";

const TWO_COMPUTES_ONE_RELEASE = `
version: v1
release:
  web: { kit: docker }
  worker-image: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 2
    worker:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
`;

const builder = new DependencyGraphBuilder();

Deno.test("LocalArtifactsPacker.packReferenced: packs a release referenced by two resources exactly once", async () => {
  const workload = new Parser().parse(TWO_COMPUTES_ONE_RELEASE);
  const graph = builder.build(workload);
  const packed: string[] = [];
  const packer: ReleasePacker = {
    pack: (name) => {
      packed.push(name);
      return Promise.resolve();
    },
  };

  await new LocalArtifactsPacker(packer).packReferenced(workload, graph);

  assertEquals(packed, ["web"]);
});

Deno.test("LocalArtifactsPacker.packReferenced: a release declared but never referenced by any resource isn't packed", async () => {
  const workload = new Parser().parse(TWO_COMPUTES_ONE_RELEASE);
  const graph = builder.build(workload);
  const packed: string[] = [];
  const packer: ReleasePacker = {
    pack: (name) => {
      packed.push(name);
      return Promise.resolve();
    },
  };

  await new LocalArtifactsPacker(packer).packReferenced(workload, graph);

  assertEquals(packed.includes("worker-image"), false);
});

Deno.test("LocalArtifactsPacker.packReferenced: a workload with no releases packs nothing", async () => {
  const workload = new Parser().parse(`
version: v1
deploy:
  databases:
    primary:
      type: relational
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`);
  const graph = builder.build(workload);
  let packCalls = 0;
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };

  await new LocalArtifactsPacker(packer).packReferenced(workload, graph);

  assertEquals(packCalls, 0);
});

Deno.test("LocalArtifactsPacker.packReferenced: passes the release's own declaration through to the packer", async () => {
  const workload = new Parser().parse(TWO_COMPUTES_ONE_RELEASE);
  const graph = builder.build(workload);
  let seenRelease: Release | undefined;
  const packer: ReleasePacker = {
    pack: (_name, release) => {
      seenRelease = release;
      return Promise.resolve();
    },
  };

  await new LocalArtifactsPacker(packer).packReferenced(workload, graph);

  assertEquals(seenRelease?.kit, "docker");
});

Deno.test("LocalArtifactsPacker.packReferenced: propagates a ReleasePackError from the packer", async () => {
  const workload = new Parser().parse(TWO_COMPUTES_ONE_RELEASE);
  const graph = builder.build(workload);
  const packer: ReleasePacker = {
    pack: (name) =>
      Promise.reject(new ReleasePackError(name, `packing "${name}" failed`)),
  };

  await assertRejects(
    () => new LocalArtifactsPacker(packer).packReferenced(workload, graph),
    ReleasePackError,
    'packing "web" failed',
  );
});
