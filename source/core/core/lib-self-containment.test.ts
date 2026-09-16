import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { SelfContainmentChecker } from "./lib-self-containment.ts";

interface MemberFixture {
  relativePath: string;
  name: string;
  declared?: boolean;
  imports?: Record<string, string>;
}

async function writeMember(
  repoRoot: string,
  member: MemberFixture,
): Promise<void> {
  const dir = join(repoRoot, member.relativePath);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    join(dir, "deno.json"),
    JSON.stringify(
      { name: member.name, imports: member.imports ?? {} },
      null,
      2,
    ),
  );
  if (member.declared) {
    const libName = member.relativePath.split("/").pop()!;
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const configPath = join(repoRoot, ".ensemble", "config.yaml");
    const existing = await Deno.readTextFile(configPath).catch(() => "libs:\n");
    const withoutTrailingNewline = existing.endsWith("\n") ? existing : `${existing}\n`;
    await Deno.writeTextFile(
      configPath,
      `${withoutTrailingNewline}  ${libName}:\n    package: "${member.name}"\n`,
    );
  }
}

async function withWorkspace(
  members: MemberFixture[],
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-self-containment-test-",
  });
  try {
    for (const member of members) {
      await writeMember(repoRoot, member);
    }
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("SelfContainmentChecker.check: an import into source/core is always a violation", async () => {
  await withWorkspace(
    [
      { relativePath: "source/core/kit-sdk", name: "@ensemble/kit-sdk" },
      {
        relativePath: "source/libs/widgets",
        name: "@x/widgets",
        declared: true,
        imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" },
      },
    ],
    async (repoRoot) => {
      const checker = new SelfContainmentChecker(repoRoot);
      const violations = await checker.check(
        join(repoRoot, "source/libs/widgets"),
      );
      assertEquals(violations.length, 1);
      assertEquals(violations[0].importSpecifier, "@ensemble/kit-sdk");
      assertEquals(
        violations[0].reason,
        `"@ensemble/kit-sdk" resolves into source/core/kit-sdk (source/core/**) — a libs library can never depend on core.`,
      );
    },
  );
});

Deno.test("SelfContainmentChecker.check: an import into a sibling lib declared under libs: is allowed", async () => {
  await withWorkspace(
    [
      { relativePath: "source/libs/base", name: "@x/base", declared: true },
      {
        relativePath: "source/libs/widgets",
        name: "@x/widgets",
        declared: true,
        imports: { "@x/base": "jsr:@x/base" },
      },
    ],
    async (repoRoot) => {
      const checker = new SelfContainmentChecker(repoRoot);
      const violations = await checker.check(
        join(repoRoot, "source/libs/widgets"),
      );
      assertEquals(violations, []);
    },
  );
});

Deno.test("SelfContainmentChecker.check: an import into a sibling lib not declared under libs: is a violation naming why", async () => {
  await withWorkspace(
    [
      { relativePath: "source/libs/base", name: "@x/base" }, // not declared
      {
        relativePath: "source/libs/widgets",
        name: "@x/widgets",
        declared: true,
        imports: { "@x/base": "jsr:@x/base" },
      },
    ],
    async (repoRoot) => {
      const checker = new SelfContainmentChecker(repoRoot);
      const violations = await checker.check(
        join(repoRoot, "source/libs/widgets"),
      );
      assertEquals(violations.length, 1);
      assertEquals(violations[0].importSpecifier, "@x/base");
      assertEquals(
        violations[0].reason,
        `"@x/base" isn't published anywhere consumers could resolve it from.`,
      );
    },
  );
});

Deno.test("SelfContainmentChecker.check: an ordinary versioned external dependency is not a violation", async () => {
  await withWorkspace(
    [
      {
        relativePath: "source/libs/widgets",
        name: "@x/widgets",
        declared: true,
        imports: { "@std/path": "jsr:@std/path@1.1.6" },
      },
    ],
    async (repoRoot) => {
      const checker = new SelfContainmentChecker(repoRoot);
      const violations = await checker.check(
        join(repoRoot, "source/libs/widgets"),
      );
      assertEquals(violations, []);
    },
  );
});

Deno.test("SelfContainmentChecker.check: a workspace-linked import matching no known member is flagged defensively", async () => {
  await withWorkspace(
    [
      {
        relativePath: "source/libs/widgets",
        name: "@x/widgets",
        declared: true,
        imports: { "@x/mystery": "jsr:@x/mystery" },
      },
    ],
    async (repoRoot) => {
      const checker = new SelfContainmentChecker(repoRoot);
      const violations = await checker.check(
        join(repoRoot, "source/libs/widgets"),
      );
      assertEquals(violations.length, 1);
      assertEquals(violations[0].importSpecifier, "@x/mystery");
    },
  );
});
