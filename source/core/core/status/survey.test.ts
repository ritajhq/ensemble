import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Builder } from "./builder.ts";
import type { App, Kit, Library, Workload } from "./project.ts";
import { Survey } from "./survey.ts";

/** Records exactly what a survey tells it, in call order. */
class Recorder extends Builder<{ steps: string[]; apps: readonly App[]; kits: readonly Kit[]; libraries: readonly Library[]; workloads: readonly Workload[] }> {
  private readonly result = { steps: [] as string[], apps: [] as readonly App[], kits: [] as readonly Kit[], libraries: [] as readonly Library[], workloads: [] as readonly Workload[] };
  apps(apps: readonly App[]) { this.result.steps.push("apps"); this.result.apps = apps; }
  kits(kits: readonly Kit[]) { this.result.steps.push("kits"); this.result.kits = kits; }
  libraries(libraries: readonly Library[]) { this.result.steps.push("libraries"); this.result.libraries = libraries; }
  workloads(workloads: readonly Workload[]) { this.result.steps.push("workloads"); this.result.workloads = workloads; }
  build() { return this.result; }
}

async function project(): Promise<string> {
  const root = await Deno.makeTempDir();
  const write = async (path: string, text: string) => {
    await Deno.mkdir(join(root, path, ".."), { recursive: true });
    await Deno.writeTextFile(join(root, path), text);
  };
  await write(".ensemble/config.yaml", `build:
  web:
    kit: react
    target: ssr
  api:
    kit: deno.bundle
publish:
  core:
    - name: core
      package: "@x/core"
      publish:
        - kit: jsr
  libs:
    - name: widgets
      package: "@x/widgets"
`);
  await write(".ensemble/vendor.lock.yml", `.ensemble/kits/deploy/compose:
  repo: https://example.com/compose.git
  ref: 1.2.0
source/libs/widgets:
  repo: https://example.com/widgets.git
  ref: 0.3.0
`);
  await Deno.mkdir(join(root, ".ensemble/kits/build/react"), { recursive: true });
  await Deno.mkdir(join(root, ".ensemble/kits/deploy/compose"), { recursive: true });
  await write("ci/shop/delivery", `version: v1
release:
  web:
    kit: docker
deploy:
  databases:
    db:
      type: relational
`);
  await Deno.mkdir(join(root, "ci/empty"), { recursive: true });
  return root;
}

Deno.test("Survey: tells the builder each section once, in order, with sorted entries", async () => {
  const result = await new Survey(await project()).describeTo(new Recorder());

  assertEquals(result.steps, ["apps", "kits", "libraries", "workloads"]);
  assertEquals(result.apps, [{ name: "api", kit: "deno.bundle", target: undefined }, { name: "web", kit: "react", target: "ssr" }]);
});

Deno.test("Survey: marks vendored kits and libraries with their repo and ref", async () => {
  const result = await new Survey(await project()).describeTo(new Recorder());

  assertEquals(result.kits, [
    { name: "react", role: "build", path: ".ensemble/kits/build/react", vendored: undefined },
    { name: "compose", role: "deploy", path: ".ensemble/kits/deploy/compose", vendored: { repo: "https://example.com/compose.git", ref: "1.2.0" } },
  ]);
  assertEquals(result.libraries.map((l) => [l.scope, l.package, l.kits, l.vendored?.ref]), [
    ["core", "@x/core", ["jsr"], undefined],
    ["libs", "@x/widgets", [], "0.3.0"],
  ]);
});

Deno.test("Survey: summarises workloads with a manifest, skipping directories without one", async () => {
  const result = await new Survey(await project()).describeTo(new Recorder());

  assertEquals(result.workloads, [{
    name: "shop",
    manifest: "ci/shop/delivery",
    ships: [{ name: "web", kit: "docker" }],
    resources: { databases: ["db"] },
  }]);
});
