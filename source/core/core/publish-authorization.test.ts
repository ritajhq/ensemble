import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { assertEquals, assertRejects } from "@std/assert";
import { ReleaseCeremony, type ShipRelease } from "./release.ts";
import {
  type PublishCheck,
  PublishUnauthorizedError,
} from "./publish-authorization.ts";
import type { CoreLibRelease } from "./lib-release-cascade.ts";
import type { Ports, ProbeResult } from "./ports.ts";

/** Ports whose `probe` answers each kit entrypoint (the spawned script's path, relative to the repo) from `verdicts`, recording what was asked. */
function probingPorts(
  repoRoot: string,
  verdicts: Record<string, ProbeResult>,
  probed: string[],
): Ports {
  return {
    repo: { findRepoRoot: () => Promise.resolve(repoRoot) },
    denoExe: { resolveDenoExecutable: () => Promise.resolve("deno") },
    process: {
      run: () => Promise.reject(new Error("must not publish")),
      exec: () => Promise.reject(new Error("must not publish")),
      capture: () => Promise.reject(new Error("must not publish")),
      probe: (_command, args) => {
        const entry = args[5].slice(repoRoot.length + 1);
        const mode = entry.endsWith("main.ts") ? ` ${args[6]}` : "";
        probed.push(`${entry}${mode}`);
        return Promise.resolve(verdicts[entry] ?? { code: 0, stderr: "" });
      },
    },
  };
}

async function withRepo(run: (repoRoot: string) => Promise<void>) {
  const repoRoot = await Deno.makeTempDir({ prefix: "ens-authorize-test-" });
  try {
    const packKit = async (kit: string, entrypoints: string[]) => {
      const dir = join(repoRoot, ".ensemble", "kits", "pack", kit);
      await ensureDir(dir);
      await Deno.writeTextFile(
        join(dir, "kit.yml"),
        "publish:\n  push: push it\n",
      );
      for (const entrypoint of entrypoints) {
        await Deno.writeTextFile(join(dir, entrypoint), "");
      }
    };
    await packKit("guarded", ["publish.ts", "authorize.ts"]);
    await packKit("unguarded", ["publish.ts"]);
    const libKit = join(repoRoot, ".ensemble", "kits", "lib", "jsr");
    await ensureDir(libKit);
    await Deno.writeTextFile(join(libKit, "main.ts"), "");
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

function ship(name: string, kit: string, publish = true): ShipRelease {
  return {
    name,
    kit,
    declaredIn: ["ci"],
    publish: publish ? { target: "push" } : undefined,
  } as ShipRelease;
}

const CORE_LIB: CoreLibRelease = {
  libRoot: "/repo/source/core/core",
  declaration: { package: "@ensemble/core", publish: [{ kit: "jsr" }] },
};

Deno.test("ReleaseCeremony.authorizePublishes: asks every publishing ship's kit and every core lib's kit, and passes when all grant", async () => {
  await withRepo(async (repoRoot) => {
    const probed: string[] = [];
    const ceremony = new ReleaseCeremony(
      repoRoot,
      probingPorts(repoRoot, {}, probed),
    );
    const checks: PublishCheck[] = [];
    ceremony.OnPublishChecked.Do((check) => checks.push(check));

    await ceremony.authorizePublishes(
      [ship("api", "guarded"), ship("pack-only", "unguarded", false)],
      [CORE_LIB],
      "1.2.3",
    );

    // Every check runs at once, so they land in no particular order.
    assertEquals(probed.toSorted(), [
      ".ensemble/kits/lib/jsr/main.ts authorize",
      ".ensemble/kits/pack/guarded/authorize.ts",
    ]);
    assertEquals(
      checks.toSorted((a, b) => a.publish.localeCompare(b.publish)),
      [
        { publish: "@ensemble/core → jsr", granted: true },
        { publish: "api → push", granted: true },
      ],
    );
  });
});

Deno.test("ReleaseCeremony.authorizePublishes: refuses with every denial and its reason, including kits that can't vouch", async () => {
  await withRepo(async (repoRoot) => {
    const ceremony = new ReleaseCeremony(
      repoRoot,
      probingPorts(repoRoot, {
        ".ensemble/kits/lib/jsr/main.ts": {
          code: 1,
          stderr: "not a member of @ensemble",
        },
      }, []),
    );

    const error = await assertRejects(
      () =>
        ceremony.authorizePublishes(
          [ship("api", "guarded"), ship("web", "unguarded")],
          [CORE_LIB],
          "1.2.3",
        ),
      PublishUnauthorizedError,
    );
    assertEquals(error.denials, [
      {
        publish: "web → push",
        reason:
          'pack kit "unguarded" has no authorize.ts, so it can\'t verify this machine may publish to "push".',
      },
      {
        publish: "@ensemble/core → jsr",
        reason: "not a member of @ensemble",
      },
    ]);
  });
});
