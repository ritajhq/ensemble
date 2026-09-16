import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import { resolveInstalledKitPath, resolveLocalKitPath } from "./kit-locator.ts";

Deno.test("resolveInstalledKitPath: resolves a bare name to its registered path", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const registry = new FileRegistry(repoRoot);
    const path = join(".ensemble", "kits", "build", "react");
    await registry.register({
      repo: "https://example.com/react.git",
      ref: "abc",
      path,
    });

    assertEquals(await resolveInstalledKitPath(registry, "react"), path);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("resolveInstalledKitPath: rejects an unknown name", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const registry = new FileRegistry(repoRoot);
    await assertRejects(
      () => resolveInstalledKitPath(registry, "nope"),
      Error,
      "No installed kit",
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("resolveInstalledKitPath: rejects an ambiguous name registered under two roles", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const registry = new FileRegistry(repoRoot);
    await registry.register({
      repo: "a",
      ref: "1",
      path: join(".ensemble", "kits", "build", "widgets"),
    });
    await registry.register({
      repo: "b",
      ref: "2",
      path: join(".ensemble", "kits", "pack", "widgets"),
    });

    await assertRejects(
      () => resolveInstalledKitPath(registry, "widgets"),
      Error,
      "ambiguous",
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("resolveLocalKitPath: resolves a bare name by scanning role directories on disk", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "lib", "widgets"), {
      recursive: true,
    });

    assertEquals(await resolveLocalKitPath(repoRoot, "widgets"), {
      role: "lib",
      path: join(".ensemble", "kits", "lib", "widgets"),
    });
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("resolveLocalKitPath: rejects a name with no matching directory under any role", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await assertRejects(
      () => resolveLocalKitPath(repoRoot, "nope"),
      Error,
      "No kit named",
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("resolveLocalKitPath: rejects a name existing under two roles", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-locator-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "build", "widgets"), {
      recursive: true,
    });
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "pack", "widgets"), {
      recursive: true,
    });

    await assertRejects(
      () => resolveLocalKitPath(repoRoot, "widgets"),
      Error,
      "ambiguous",
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
