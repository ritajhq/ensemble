import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import type { Workload } from "./deploy/index.ts";
import { DeploymentEnvironment } from "./env-files.ts";

async function withRepo(
  files: Record<string, string>,
  run: (environment: DeploymentEnvironment) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir();
  try {
    for (const [path, content] of Object.entries(files)) {
      await Deno.mkdir(join(repoRoot, path, ".."), { recursive: true });
      await Deno.writeTextFile(join(repoRoot, path), content);
    }
    await run(new DeploymentEnvironment(repoRoot));
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

async function withoutEnv(
  vars: readonly string[],
  run: () => Promise<void>,
): Promise<void> {
  const previous = new Map(vars.map((v) => [v, Deno.env.get(v)]));
  for (const v of vars) Deno.env.delete(v);
  try {
    await run();
  } finally {
    for (const v of vars) {
      const value = previous.get(v);
      if (value === undefined) Deno.env.delete(v);
      else Deno.env.set(v, value);
    }
  }
}

Deno.test("DeploymentEnvironment.load: sets each key under its uppercase form", async () => {
  await withoutEnv(["FRONTEND_BASE_URL"], async () => {
    await withRepo(
      { "ci/portal/dev.env": "frontend_base_url=/\n" },
      async (environment) => {
        await environment.load(
          DeploymentEnvironment.required(["ci/portal/dev.env"]),
        );
        assertEquals(Deno.env.get("FRONTEND_BASE_URL"), "/");
      },
    );
  });
});

Deno.test("DeploymentEnvironment.load: a value already exported wins over a file's", async () => {
  await withoutEnv(["FRONTEND_BASE_URL"], async () => {
    Deno.env.set("FRONTEND_BASE_URL", "https://real.example");
    await withRepo(
      { "dev.env": "frontend_base_url=/dev-only\n" },
      async (environment) => {
        await environment.load(DeploymentEnvironment.required(["dev.env"]));
        assertEquals(Deno.env.get("FRONTEND_BASE_URL"), "https://real.example");
      },
    );
  });
});

Deno.test("DeploymentEnvironment.load: a required file that doesn't exist fails", async () => {
  await withRepo({}, async (environment) => {
    await assertRejects(
      () => environment.load(DeploymentEnvironment.required(["missing.env"])),
      Error,
      "Env file not found",
    );
  });
});

Deno.test("DeploymentEnvironment.load: develop's conventional files are optional, and both are read", async () => {
  await withoutEnv(["DOMAIN", "PGPASSWORD"], async () => {
    await withRepo({
      "ci/portal/dev.env": "domain=lvh.me\n",
      ".ensemble/deploy/portal/secrets.env": "pgpassword=hunter2\n",
    }, async (environment) => {
      await environment.load(DeploymentEnvironment.developConvention("portal"));
      assertEquals(Deno.env.get("DOMAIN"), "lvh.me");
      assertEquals(Deno.env.get("PGPASSWORD"), "hunter2");
    });
    await withRepo({}, async (environment) => {
      await environment.load(DeploymentEnvironment.developConvention("portal"));
    });
  });
});

Deno.test("DeploymentEnvironment.load: the same key in two files is rejected", async () => {
  await withRepo(
    { "a.env": "pgpassword=one\n", "b.env": "pgpassword=two\n" },
    async (environment) => {
      await assertRejects(
        () =>
          environment.load(DeploymentEnvironment.required(["a.env", "b.env"])),
        Error,
        "defined in both",
      );
    },
  );
});

Deno.test("DeploymentEnvironment.load: a $ reference is rejected, a single-quoted $ is literal", async () => {
  await withoutEnv(["DB_URL", "LITERAL"], async () => {
    await withRepo(
      { "a.env": "db_url=postgres://app:${pw}@db\n" },
      async (environment) => {
        await assertRejects(
          () => environment.load(DeploymentEnvironment.required(["a.env"])),
          Error,
          "don't interpolate",
        );
      },
    );
    await withRepo({ "a.env": "literal='pa$$word'\n" }, async (environment) => {
      await environment.load(DeploymentEnvironment.required(["a.env"]));
      assertEquals(Deno.env.get("LITERAL"), "pa$$word");
    });
  });
});

const WORKLOAD = {
  variables: { domain: {}, greeting: { default: "hi" } },
  secrets: { pgpassword: { source: "environment" }, cert: { source: "file" } },
} as unknown as Workload;

Deno.test("DeploymentEnvironment.assertComplete: names every missing variable and environment-sourced secret at once", async () => {
  await withoutEnv(["DOMAIN", "PGPASSWORD", "GREETING", "CERT"], async () => {
    await withRepo({}, async (environment) => {
      const error = assertThrows(() => environment.assertComplete(WORKLOAD));
      assertEquals(
        (error as Error).message,
        "No value for variables.domain, secrets.pgpassword: export DOMAIN, PGPASSWORD, or pass an --env-file that sets them.",
      );
    });
  });
});

Deno.test("DeploymentEnvironment.assertComplete: passes once everything without a default is set", async () => {
  await withoutEnv(["DOMAIN", "PGPASSWORD"], async () => {
    Deno.env.set("DOMAIN", "ritaj.app");
    Deno.env.set("PGPASSWORD", "x");
    await withRepo({}, async (environment) => {
      environment.assertComplete(WORKLOAD);
    });
  });
});
