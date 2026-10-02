import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { exists } from "@std/fs";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { Uninstaller } from "./uninstaller.ts";
import { Survey } from "../status/survey.ts";
import { KitUsages } from "../status/usages.ts";

class FakePackageSource implements PackageSource {
  constructor(private readonly localChanges = false) {}
  hasLocalChanges(): Promise<boolean> {
    return Promise.resolve(this.localChanges);
  }
  fetch(): Promise<void> {
    throw new Error("not used by Uninstaller");
  }
  currentRef(): Promise<string> {
    throw new Error("not used by Uninstaller");
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by Uninstaller");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by Uninstaller");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by Uninstaller");
  }
  switchTo(): Promise<void> {
    throw new Error("not used by Uninstaller");
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by Uninstaller");
  }
}

const KIT = ".ensemble/kits/build/react";

async function projectWithVendoredKit(): Promise<{ root: string; registry: FileRegistry }> {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(join(root, KIT), { recursive: true });
  const registry = new FileRegistry(root);
  await Deno.writeTextFile(join(root, ".gitignore"), "node_modules\n");
  await registry.register({ repo: "https://example.com/react.git", ref: "1.0.0", path: KIT });
  return { root, registry };
}

Deno.test("Uninstaller: removes the checkout, its lockfile entry and its .gitignore line", async () => {
  const { root, registry } = await projectWithVendoredKit();

  const entry = await new Uninstaller(root, registry, new FakePackageSource()).uninstall(KIT, [], { force: false });

  assertEquals(entry.ref, "1.0.0");
  assertEquals(await exists(join(root, KIT)), false);
  assertEquals(await registry.entryFor(KIT), undefined);
  assertEquals(await Deno.readTextFile(join(root, ".gitignore")), "node_modules\n");
});

Deno.test("Uninstaller: refuses something authored in the project", async () => {
  const root = await Deno.makeTempDir();
  await assertRejects(
    () => new Uninstaller(root, new FileRegistry(root), new FakePackageSource()).uninstall(KIT, [], { force: true }),
    Error,
    "isn't vendored",
  );
});

Deno.test("Uninstaller: refuses while still used, unless forced", async () => {
  const { root, registry } = await projectWithVendoredKit();
  const uninstaller = new Uninstaller(root, registry, new FakePackageSource());

  await assertRejects(() => uninstaller.uninstall(KIT, ["app web (build.web.kit)"], { force: false }), Error, "app web");
  assertEquals(await exists(join(root, KIT)), true);

  await uninstaller.uninstall(KIT, ["app web (build.web.kit)"], { force: true });
  assertEquals(await exists(join(root, KIT)), false);
});

Deno.test("Uninstaller: refuses a checkout with local changes, unless forced", async () => {
  const { root, registry } = await projectWithVendoredKit();
  const uninstaller = new Uninstaller(root, registry, new FakePackageSource(true));

  await assertRejects(() => uninstaller.uninstall(KIT, [], { force: false }), Error, "local changes");
  await uninstaller.uninstall(KIT, [], { force: true });
  assertEquals(await registry.entryFor(KIT), undefined);
});

Deno.test("KitUsages: lists the apps that build with a kit, by role", async () => {
  const { root, registry } = await projectWithVendoredKit();
  await Deno.writeTextFile(join(root, ".ensemble/config.yaml"), "build:\n  web:\n    kit: react\n  api:\n    kit: deno.bundle\n");

  const survey = new Survey(root, registry);
  assertEquals(await survey.describeTo(new KitUsages("build", "react")), ["app web (build.web.kit)"]);
  assertEquals(await survey.describeTo(new KitUsages("pack", "react")), []);
});
