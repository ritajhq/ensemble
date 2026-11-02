// deno-lint-ignore-file no-import-prefix -- run with --no-config, so it has no import map to name these in
import { copy, ensureDir, exists, expandGlob } from "jsr:@std/fs@1.0.24";
import { dirname, fromFileUrl, join } from "jsr:@std/path@1.1.6";
import { parseArgs } from "jsr:@std/cli@1.0.32/parse-args";
import {
  parse as parseYaml,
  stringify as stringifyYaml,
} from "jsr:@std/yaml@1.1.2";

const MOCK = dirname(fromFileUrl(import.meta.url));
const REPO = join(MOCK, "..", "..", "..");
const CARGO_TARGET_DIR = join(REPO, "source/artifacts/.mock-cargo-target");
const CONFIG = join(REPO, ".ensemble/ecosystems/deno/deno.json");

interface Outcome {
  readonly code: number;
  readonly output: string;
}

/** `deno`'s arguments for running the working tree's `ens` from anywhere. */
function ensArgs(...args: string[]): string[] {
  return [
    "run",
    "-A",
    "-q",
    "--config",
    CONFIG,
    "--minimum-dependency-age",
    "0",
    join(REPO, "source/apps/cli/main.ts"),
    ...args,
  ];
}

const json = (value: object) => JSON.stringify(value, null, 2) + "\n";

/** Lib kits standing in for registries, so a release publishes nothing. They exist only here: a project wouldn't want them. */
const STAND_IN_KITS: Record<string, string> = {
  local: `import * as KitSdk from "@ensemble/kit-sdk";

await KitSdk.Lib.run({
  authorize: () => Promise.resolve(),
  stamp: () => Promise.resolve(),
  publish: () => Promise.resolve(),
});
`,
  // Packages the whole workspace: cargo looks a crate's siblings up on the
  // registry unless they're being packaged alongside it.
  crates: `import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

const VERSION_LINE = /^version = "[^"]*"$/m;

await KitSdk.Lib.run({
  authorize: () => Promise.resolve(),
  stamp: async ({ libRoot, version }) => {
    const path = join(libRoot, "Cargo.toml");
    const manifest = await Deno.readTextFile(path);
    await Deno.writeTextFile(
      path,
      manifest.replace(VERSION_LINE, \`version = "\${version.replace(/^v/, "")}"\`),
    );
  },
  publish: async () => {
    const repoRoot = await KitSdk.findRepoRoot();
    const registry = join(repoRoot, "source/artifacts/packages/local-registry");
    await ensureDir(registry);
    const { code } = await new Deno.Command("cargo", {
      args: ["package", "--quiet", "--allow-dirty", "--no-verify", "--workspace", "--target-dir", registry],
      cwd: join(repoRoot, ".ensemble/ecosystems/cargo"),
    }).spawn().status;
    if (code !== 0) Deno.exit(code);
  },
});
`,
};

async function writeStandInKits(root: string): Promise<void> {
  for (const [name, source] of Object.entries(STAND_IN_KITS)) {
    const kit = join(root, ".ensemble/kits/lib", name);
    await ensureDir(kit);
    await Deno.writeTextFile(join(kit, "main.ts"), source);
    await Deno.writeTextFile(
      join(kit, "kit.yml"),
      "role: lib\nprotocol: 1\n",
    );
    await Deno.writeTextFile(
      join(kit, "deno.json"),
      json({
        imports: {
          "@std/fs": "jsr:@std/fs@1.0.24",
          "@std/path": "jsr:@std/path@1.1.6",
          "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk",
        },
      }),
    );
  }
}

/** One throwaway project: its own git repository, with `0.1.0` tagged and pushed to a local `origin`. */
class Sandbox {
  private readonly log: string[] = [];

  private constructor(
    readonly root: string,
    private readonly logPath: string,
  ) {}

  static async create(
    parent: string,
    scenario: string,
    legacy: boolean,
  ): Promise<Sandbox> {
    const directory = join(parent, scenario);
    await Deno.remove(directory, { recursive: true }).catch(() => {});
    const root = join(directory, "project");
    await ensureDir(root);
    const sandbox = new Sandbox(root, join(directory, "output.log"));
    if (legacy) await writeLegacyProject(root);
    else await sandbox.sliceThisRepository();

    const origin = join(directory, "origin.git");
    await sandbox.run("git", ["init", "-q", "--bare", origin]);
    await sandbox.run("git", ["init", "-q", "-b", "main"]);
    await sandbox.run("git", ["remote", "add", "origin", origin]);
    await sandbox.run("git", ["add", "."]);
    await sandbox.run("git", ["commit", "-q", "-m", "chore: project"]);
    await sandbox.run("git", ["tag", "0.1.0"]);
    await sandbox.run("git", ["push", "-q", "origin", "main", "0.1.0"]);
    return sandbox;
  }

  /**
   * This repository with only the mock for an app, plus libraries a release can
   * move, since this repository doesn't publish the mock's own. Its kits
   * resolve the kit SDK from the `source/core` copied along, so they see what
   * this working tree has, published or not.
   */
  private async sliceThisRepository(): Promise<void> {
    for (
      const path of [
        ".gitignore",
        ".ensemble/.gitignore",
        ".ensemble/kits",
        ".ensemble/ecosystems/deno/settings.json",
        ".ensemble/ecosystems/deno/deno.lock",
        ".ensemble/ecosystems/cargo/Cargo.toml",
        ".ensemble/ecosystems/cargo/Cargo.lock",
        "source/core",
        "source/apps/mock",
        "source/ship/mock",
        "source/artifacts/.gitignore",
      ]
    ) {
      await ensureDir(dirname(this.path(path)));
      await copy(join(REPO, path), this.path(path), { overwrite: true });
    }
    await Deno.remove(this.path("source/apps/mock/exercise.ts"));
    await writeStandInKits(this.root);
    await this.writeLibraries();
    await this.writeConfig();
    await this.ens("sync");
    await this.ens("exec", "cargo", "metadata", "--format-version", "1");
  }

  private async writeLibraries(): Promise<void> {
    const crate = async (path: string, name: string, extra = "") => {
      await ensureDir(this.path(path, "src"));
      await Deno.writeTextFile(
        this.path(path, "Cargo.toml"),
        `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\nlicense = "MIT"\ndescription = "A mock crate."\n${extra}`,
      );
      await Deno.writeTextFile(this.path(path, "src/lib.rs"), "");
    };
    await crate("source/libs/parts", "tally-parts");
    await crate(
      "source/core/books",
      "tally-books",
      `\n[dependencies]\ntally-parts = { path = "../../libs/parts", version = "0.1.0" }\n`,
    );
    await ensureDir(this.path("source/core/press"));
    await Deno.writeTextFile(
      this.path("source/core/press/deno.json"),
      json({ name: "@tally/press", version: "0.1.0", exports: "./index.ts" }),
    );
    await Deno.writeTextFile(
      this.path("source/core/press/index.ts"),
      'export const PRESS = "press";\n',
    );

    const cli = this.path("source/apps/mock/cli/Cargo.toml");
    await Deno.writeTextFile(
      cli,
      (await Deno.readTextFile(cli)).replace(
        "[dependencies]\n",
        `[dependencies]\ntally-books = { path = "../../../core/books", version = "0.1.0" }\n`,
      ),
    );
    const api = this.path("source/apps/mock/api/deno.json");
    const manifest = JSON.parse(await Deno.readTextFile(api));
    manifest.imports["@tally/press"] = "jsr:@tally/press@^0.1.0";
    await Deno.writeTextFile(api, json(manifest));

    await ensureDir(this.path("ci/desktop"));
    await Deno.writeTextFile(
      this.path("ci/desktop/delivery.yml"),
      "version: v1\n\nrelease:\n  mock/desktop:\n    kit: tauri\n",
    );
  }

  private async writeConfig(): Promise<void> {
    const real = parseYaml(
      await Deno.readTextFile(join(REPO, ".ensemble/config.yaml")),
    ) as { ecosystems: string[]; build: Record<string, unknown> };
    const build = Object.fromEntries(
      Object.entries(real.build).filter(([app]) => app.startsWith("mock/")),
    );
    await Deno.writeTextFile(
      this.path(".ensemble/config.yaml"),
      stringifyYaml({
        ecosystems: real.ecosystems,
        build,
        publish: {
          core: [
            {
              name: "books",
              package: "tally-books",
              publish: [{ kit: "crates" }],
            },
            {
              name: "press",
              package: "@tally/press",
              publish: [{ kit: "local" }],
            },
          ],
          libs: [
            {
              name: "parts",
              package: "tally-parts",
              publish: [{ kit: "crates" }],
            },
          ],
        },
      }),
    );
  }

  ens(...args: string[]): Promise<Outcome> {
    return this.run(Deno.execPath(), ensArgs(...args));
  }

  /** `ens` in another directory: a project `ens init` made next to this one. */
  ensIn(directory: string, ...args: string[]): Promise<Outcome> {
    return this.run(Deno.execPath(), ensArgs(...args), directory);
  }

  async run(
    command: string,
    args: string[],
    cwd: string = this.root,
  ): Promise<Outcome> {
    this.log.push(`$ ${command} ${args.join(" ")}`);
    const { code, stdout, stderr } = await new Deno.Command(command, {
      args,
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: {
        CARGO_TARGET_DIR,
        GIT_AUTHOR_NAME: "mock",
        GIT_AUTHOR_EMAIL: "mock@example.invalid",
        GIT_COMMITTER_NAME: "mock",
        GIT_COMMITTER_EMAIL: "mock@example.invalid",
      },
    }).output();
    const decoder = new TextDecoder();
    const output = decoder.decode(stdout) + decoder.decode(stderr);
    this.log.push(output, `(exit ${code})`);
    await Deno.writeTextFile(this.logPath, this.log.join("\n"));
    return { code, output };
  }

  /** Removes everything but the log: a scenario that passed needs no looking into, and each copy is large. */
  async discard(): Promise<void> {
    const directory = dirname(this.root);
    for await (const entry of Deno.readDir(directory)) {
      if (join(directory, entry.name) === this.logPath) continue;
      await Deno.remove(join(directory, entry.name), { recursive: true });
    }
  }

  path(...segments: string[]): string {
    return join(this.root, ...segments);
  }

  async read(...segments: string[]): Promise<string> {
    return await Deno.readTextFile(this.path(...segments));
  }

  /** The last line of `outcome`'s output that says something, for a report. */
  static reason(outcome: Outcome): string {
    const lines = outcome.output.trim().split("\n");
    return lines.at(-1)?.slice(0, 160) ?? "";
  }
}

/**
 * A Deno project as `ens init` used to lay one out: `deno.json` at the root and
 * no `ecosystems:`, which has to keep working untouched. It stands for projects
 * already out there, resolving the published kit SDK as they do.
 */
async function writeLegacyProject(root: string): Promise<void> {
  const write = async (path: string, text: string) => {
    await ensureDir(dirname(join(root, path)));
    await Deno.writeTextFile(join(root, path), text);
  };
  await write(".gitignore", ".ensemble/kits/**/deno.lock\n");
  await write(
    ".ensemble/.gitignore",
    "config.local.yaml\nrelease/secrets.env\nrelease/state/\n/deploy/\n",
  );
  await write(".ensemble/kits/lib/local/main.ts", STAND_IN_KITS.local);
  await write(".ensemble/kits/lib/local/kit.yml", "role: lib\nprotocol: 1\n");
  await write(
    ".ensemble/kits/lib/local/deno.json",
    json({ imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk@^0.62.0" } }),
  );
  await write(
    ".ensemble/config.yaml",
    `publish:
  core:
    - name: ink
      package: "@quill/ink"
      publish:
        - kit: local
  libs:
    - name: blot
      package: "@quill/blot"
      publish:
        - kit: local
`,
  );
  await write(
    "deno.json",
    json({ workspace: ["source/apps/**", "source/core/**", "source/libs/**"] }),
  );
  await write(
    "source/core/ink/deno.json",
    json({ name: "@quill/ink", version: "0.1.0", exports: "./index.ts" }),
  );
  await write("source/core/ink/index.ts", 'export const COLOR = "blue";\n');
  await write(
    "source/apps/pen/deno.json",
    json({ imports: { "@quill/ink": "jsr:@quill/ink@^0.1.0" } }),
  );
  await write(
    "source/apps/pen/main.ts",
    'import { COLOR } from "@quill/ink";\n\nconsole.log(COLOR);\n',
  );
  await write(
    "source/libs/blot/deno.json",
    json({
      name: "@quill/blot",
      version: "0.1.0",
      exports: "./index.ts",
      imports: { "@quill/ink": "jsr:@quill/ink" },
    }),
  );
  await write(
    "source/libs/blot/index.ts",
    'export { COLOR } from "@quill/ink";\n',
  );
}

/**
 * Runs `ens init fresh` next to the sandbox, fetching kits from a scratch
 * repository of this tree's. Until a release ships this tree's kit SDK, a brand
 * new project's kits have to be pointed at it by hand: each kit links to it for
 * init itself, and `source/core` is copied in for what follows.
 */
async function initialize(
  sandbox: Sandbox,
  ...flags: string[]
): Promise<{ outcome: Outcome; fresh: string }> {
  const parent = dirname(sandbox.root);
  const fresh = join(parent, "fresh");
  const repository = join(parent, "kits-repo");
  const kits = join(repository, ".ensemble", "kits");
  await copy(join(REPO, ".ensemble", "kits"), kits);
  for await (const found of expandGlob("*/*/deno.json", { root: kits })) {
    const manifest = JSON.parse(await Deno.readTextFile(found.path));
    manifest.imports["@ensemble/kit-sdk"] = "jsr:@ensemble/kit-sdk";
    manifest.links = ["core", "host", "kit-sdk"].map((member) =>
      join(REPO, "source", "core", member)
    );
    await Deno.writeTextFile(found.path, json(manifest));
  }
  await sandbox.run("git", ["init", "-q", "-b", "main"], repository);
  await sandbox.run("git", ["add", "."], repository);
  await sandbox.run("git", ["commit", "-q", "-m", "feat: kits"], repository);
  const outcome = await sandbox.ensIn(
    parent,
    "init",
    "fresh",
    "--kits-from",
    `file://${repository}@main`,
    ...flags,
  );
  if (outcome.code !== 0) return { outcome, fresh };
  await copy(join(REPO, "source/core"), join(fresh, "source/core"), {
    overwrite: true,
  });
  return { outcome: await sandbox.ensIn(fresh, "sync"), fresh };
}

/** What a project's root may hold: anything else is a tool's file that belongs under `.ensemble`. */
const ROOT_ENTRIES = new Set([
  ".ensemble",
  ".git",
  ".gitignore",
  "README.md",
  "ci",
  "docs",
  "source",
]);
/** What's only ever a workspace's, never one package's. */
const WORKSPACE_FILES = new Set([
  "Cargo.lock",
  "deno.lock",
  "rust-toolchain.toml",
]);

async function strayEntries(root: string): Promise<string[]> {
  const strays = [];
  for await (const entry of Deno.readDir(root)) {
    if (!ROOT_ENTRIES.has(entry.name)) strays.push(entry.name);
  }
  const packageRoots = expandGlob("source/{Cargo.toml,deno.json}", { root });
  for await (const found of packageRoots) strays.push(`source/${found.name}`);
  const files = expandGlob("source/**/*", {
    root,
    exclude: ["source/artifacts/**", "source/ship/**", "**/node_modules/**"],
  });
  for await (const found of files) {
    if (WORKSPACE_FILES.has(found.name)) strays.push(found.path);
  }
  return strays;
}

/** What a scenario found: the user's goal was met, or `gap` says how it wasn't. */
type Finding = { readonly gap?: string; readonly note?: string };

interface Scenario {
  readonly name: string;
  /** Runs against a Deno project in the old layout instead of a slice of this repository. */
  readonly legacy?: boolean;
  readonly goal: string;
  run(sandbox: Sandbox): Promise<Finding>;
}

function failed(step: string, outcome: Outcome): Finding {
  return { gap: `${step} exited ${outcome.code}: ${Sandbox.reason(outcome)}` };
}

async function packaged(sandbox: Sandbox, pattern: string): Promise<string[]> {
  const files = [];
  const matches = expandGlob(pattern, {
    root: sandbox.path("source/artifacts/packages"),
  });
  for await (const match of matches) files.push(match.name);
  return files;
}

async function uncommitted(sandbox: Sandbox): Promise<string> {
  return (await sandbox.run("git", ["status", "--porcelain"])).output.trim();
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "build-cli",
    goal: "ens build a Rust CLI, and the result runs",
    async run(sandbox) {
      const built = await sandbox.ens("build", "mock/cli");
      if (built.code !== 0) return failed("ens build", built);
      const ran = await sandbox.run(
        sandbox.path("source/artifacts/mock/cli/tally-cli"),
        ["1.25", "2.5"],
      );
      return ran.output.trim() === "3.75"
        ? {}
        : { gap: `tally-cli printed "${ran.output.trim()}"` };
    },
  },
  {
    name: "pack-cli",
    goal: "ens pack builds the CLI first, then archives it",
    async run(sandbox) {
      const packed = await sandbox.ens("pack", "mock/cli", "tarball");
      if (packed.code !== 0) return failed("ens pack", packed);
      const files = await packaged(sandbox, "mock/cli.tar.gz");
      return files.length > 0 ? {} : { gap: "no mock/cli.tar.gz produced" };
    },
  },
  {
    name: "shell-alone",
    goal:
      "ens build the Tauri shell alone, without building its web app by hand first",
    async run(sandbox) {
      const built = await sandbox.ens("build", "mock/desktop/shell");
      return built.code === 0 ? {} : failed("ens build", built);
    },
  },
  {
    name: "pack-desktop",
    goal: "ens pack builds web, then the shell, then a .deb",
    async run(sandbox) {
      const packed = await sandbox.ens("pack", "mock/desktop", "tauri");
      if (packed.code !== 0) return failed("ens pack", packed);
      const debs = await packaged(sandbox, "*.deb");
      if (debs.length === 0) return { gap: "no .deb produced" };
      return { note: debs.join(", ") };
    },
  },
  {
    name: "pack-version",
    goal: "ens pack --version names the .deb after the release, not Cargo.toml",
    async run(sandbox) {
      const packed = await sandbox.ens(
        "pack",
        "mock/desktop",
        "tauri",
        "--version",
        "0.3.0",
      );
      if (packed.code !== 0) return failed("ens pack", packed);
      const debs = await packaged(sandbox, "Tally_0.3.0_*.deb");
      return debs.length > 0 ? {} : { gap: "no Tally_0.3.0 .deb produced" };
    },
  },
  {
    name: "status",
    goal: "ens status describes the project",
    async run(sandbox) {
      const status = await sandbox.ens("status");
      return status.code === 0 ? {} : failed("ens status", status);
    },
  },
  {
    name: "app-create",
    goal: "ens app create scaffolds a crate that builds straight away",
    async run(sandbox) {
      const created = await sandbox.ens("app", "create", "cargo", "tool");
      if (created.code !== 0) return failed("ens app create", created);
      const built = await sandbox.ens("build", "tool");
      return built.code === 0 ? {} : failed("ens build", built);
    },
  },
  {
    name: "tools",
    goal: "cargo works inside a crate, and ens exec reaches both languages",
    async run(sandbox) {
      const inside = await sandbox.run(
        "cargo",
        ["metadata", "--no-deps", "--format-version", "1"],
        sandbox.path("source/apps/mock/cli"),
      );
      if (inside.code !== 0) return failed("cargo in a crate", inside);
      const rust = await sandbox.ens(
        "exec",
        "cargo",
        "check",
        "-q",
        "-p",
        "tally-cli",
      );
      if (rust.code !== 0) return failed("ens exec cargo", rust);
      const deno = await sandbox.ens(
        "exec",
        "deno",
        "check",
        "-q",
        "--minimum-dependency-age",
        "0",
        "source/apps/mock/api/main.ts",
      );
      return deno.code === 0 ? {} : failed("ens exec deno", deno);
    },
  },
  {
    name: "lib-new",
    goal: "ens lib new scaffolds a crate, and the workspace still resolves",
    async run(sandbox) {
      const created = await sandbox.ens(
        "lib",
        "new",
        "fees",
        "--ecosystem",
        "cargo",
      );
      if (created.code !== 0) return failed("ens lib new", created);
      if (await exists(sandbox.path("source/libs/fees/deno.json"))) {
        return { gap: "wrote source/libs/fees/deno.json, not a Cargo.toml" };
      }
      const resolved = await sandbox.ens(
        "exec",
        "cargo",
        "metadata",
        "--no-deps",
        "--format-version",
        "1",
      );
      if (resolved.code !== 0) return failed("cargo metadata", resolved);
      return resolved.output.includes('"name":"fees"')
        ? {}
        : { gap: "the new lib isn't a workspace member" };
    },
  },
  {
    name: "lib-publish",
    goal: "ens lib publish packages a Rust lib through its kit",
    async run(sandbox) {
      const published = await sandbox.ens(
        "lib",
        "publish",
        "parts",
        "crates",
        "0.2.0",
      );
      if (published.code !== 0) return failed("ens lib publish", published);
      const crates = await packaged(sandbox, "local-registry/package/*.crate");
      return crates.length > 0 ? {} : { gap: "no .crate produced" };
    },
  },
  {
    name: "lib-containment",
    goal: "ens lib publish refuses a Rust lib depending on core",
    async run(sandbox) {
      const manifest = sandbox.path("source/libs/parts/Cargo.toml");
      await Deno.writeTextFile(
        manifest,
        `${await Deno.readTextFile(
          manifest,
        )}\n[dev-dependencies]\ntally-books = { path = "../../core/books" }\n`,
      );
      const published = await sandbox.ens(
        "lib",
        "publish",
        "parts",
        "crates",
        "0.2.0",
      );
      return published.code !== 0 && published.output.includes("source/core/**")
        ? {}
        : { gap: `published anyway: ${Sandbox.reason(published)}` };
    },
  },
  {
    name: "kit-install",
    goal: "ens kit install works without any lockfile at the root",
    async run(sandbox) {
      const kitRepo = join(dirname(sandbox.root), "kit-repo");
      await copy(sandbox.path(".ensemble/kits/build/cargo"), kitRepo);
      await sandbox.run("git", ["init", "-q", "-b", "main"], kitRepo);
      await sandbox.run("git", ["add", "."], kitRepo);
      await sandbox.run("git", ["commit", "-q", "-m", "feat: kit"], kitRepo);
      const installed = await sandbox.ens(
        "kit",
        "install",
        `file://${kitRepo}`,
      );
      return installed.code === 0 ? {} : failed("ens kit install", installed);
    },
  },
  {
    name: "init",
    goal: "ens init starts a Rust project with no Deno files, ready for a lib",
    async run(sandbox) {
      const { outcome, fresh } = await initialize(
        sandbox,
        "--ecosystem",
        "cargo",
      );
      if (outcome.code !== 0) return failed("ens init", outcome);
      if (await exists(join(fresh, ".ensemble/ecosystems/deno"))) {
        return { gap: "wrote Deno's files for a Rust project" };
      }
      const created = await sandbox.ensIn(fresh, "lib", "new", "fees");
      if (created.code !== 0) return failed("ens lib new", created);
      const resolved = await sandbox.ensIn(
        fresh,
        "exec",
        "cargo",
        "metadata",
        "--no-deps",
        "--format-version",
        "1",
      );
      if (resolved.code !== 0) return failed("cargo metadata", resolved);
      return resolved.output.includes('"name":"fees"')
        ? {}
        : { gap: "the new lib isn't a member of the workspace" };
    },
  },
  {
    name: "init-deno",
    goal: "ens init's default Deno project builds and packs an app using a lib",
    async run(sandbox) {
      const { outcome, fresh } = await initialize(sandbox);
      if (outcome.code !== 0) return failed("ens init", outcome);
      const ens = (...args: string[]) => sandbox.ensIn(fresh, ...args);

      const app = await ens("app", "create", "deno.bundle", "api");
      if (app.code !== 0) return failed("ens app create", app);
      const lib = await ens("lib", "new", "fees");
      if (lib.code !== 0) return failed("ens lib new", lib);
      // Deno only links a package by a scoped name.
      await Deno.writeTextFile(
        join(fresh, "source/libs/fees/deno.json"),
        json({ name: "@fresh/fees", exports: "./index.ts" }),
      );
      await Deno.writeTextFile(
        join(fresh, "source/libs/fees/index.ts"),
        "export const FEE = 7;\n",
      );
      await Deno.writeTextFile(
        join(fresh, "source/apps/api/main.ts"),
        `import { FEE } from "@fresh/fees";\nconsole.log(FEE);\n`,
      );
      const built = await ens("build", "api");
      if (built.code !== 0) return failed("ens build", built);
      const ran = await sandbox.run(
        Deno.execPath(),
        ["run", "-A", "--no-config", "source/artifacts/api/main.js"],
        fresh,
      );
      if (ran.output.trim() !== "7") {
        return { gap: `the app printed "${ran.output.trim()}"` };
      }

      const ship = join(fresh, "source/ship/api");
      await ensureDir(ship);
      await Deno.writeTextFile(
        join(ship, "compile.yml"),
        "source: api\noutput: api\npermissions:\n  allow-all: true\n",
      );
      const packed = await ens("pack", "api", "deno.compile");
      if (packed.code !== 0) return failed("ens pack", packed);
      const compiled = await sandbox.run(
        join(fresh, "source/artifacts/packages/api"),
        [],
        fresh,
      );
      return compiled.output.trim() === "7"
        ? {}
        : { gap: `the compiled app printed "${compiled.output.trim()}"` };
    },
  },
  {
    name: "init-mixed",
    goal:
      "ens init starts a project in two languages, with nothing at the root",
    async run(sandbox) {
      const { outcome, fresh } = await initialize(
        sandbox,
        "--ecosystem",
        "cargo",
        "--ecosystem",
        "deno",
      );
      if (outcome.code !== 0) return failed("ens init", outcome);
      for (
        const file of [
          ".ensemble/ecosystems/deno/deno.json",
          ".ensemble/ecosystems/cargo/Cargo.toml",
        ]
      ) {
        if (!await exists(join(fresh, file))) return { gap: `no ${file}` };
      }
      const strays = await strayEntries(fresh);
      return strays.length === 0
        ? {}
        : { gap: `left ${strays.join(", ")} outside .ensemble` };
    },
  },
  {
    name: "legacy-release",
    legacy: true,
    goal: "a Deno project with a root deno.json still releases as before",
    async run(sandbox) {
      const released = await sandbox.ens("release", "next", "minor", "--yes");
      if (released.code !== 0) return failed("ens release next", released);
      const core = JSON.parse(await sandbox.read("source/core/ink/deno.json"));
      if (core.version !== "0.2.0") {
        return { gap: `core stayed at ${core.version}` };
      }
      const app = JSON.parse(await sandbox.read("source/apps/pen/deno.json"));
      if (app.imports["@quill/ink"] !== "jsr:@quill/ink@^0.2.0") {
        return { gap: `app pins ${app.imports["@quill/ink"]}` };
      }
      if (await exists(sandbox.path(".ensemble/ecosystems"))) {
        return { gap: "wrote .ensemble/ecosystems into an old project" };
      }
      const dirt = await uncommitted(sandbox);
      if (dirt !== "") {
        return { gap: `left uncommitted: ${dirt.slice(0, 120)}` };
      }
      const tags = await sandbox.run("git", ["tag", "--list", "0.2.0"]);
      return tags.output.trim() === "0.2.0" ? {} : { gap: "0.2.0 not tagged" };
    },
  },
  {
    name: "legacy-lib",
    legacy: true,
    goal: "ens lib new and its self-containment check still work there",
    async run(sandbox) {
      const created = await sandbox.ens("lib", "new", "nib");
      if (created.code !== 0) return failed("ens lib new", created);
      if (!await exists(sandbox.path("source/libs/nib/deno.json"))) {
        return { gap: "wrote no deno.json" };
      }
      const leaky = await sandbox.ens(
        "lib",
        "publish",
        "blot",
        "local",
        "0.2.0",
      );
      return leaky.code !== 0 && leaky.output.includes("source/core/**")
        ? {}
        : { gap: `a lib importing core published: ${Sandbox.reason(leaky)}` };
    },
  },
  {
    name: "mixed-build",
    goal: "a Rust app and a Deno app build and run in one project",
    async run(sandbox) {
      const rust = await sandbox.ens("build", "mock/cli");
      if (rust.code !== 0) return failed("ens build mock/cli", rust);
      const deno = await sandbox.ens("build", "mock/api");
      if (deno.code !== 0) return failed("ens build mock/api", deno);
      const total = await sandbox.run(
        sandbox.path("source/artifacts/mock/cli/tally-cli"),
        ["1", "2"],
      );
      if (total.output.trim() !== "3.00") {
        return { gap: `the Rust app printed "${total.output.trim()}"` };
      }
      const color = await sandbox.run(Deno.execPath(), [
        "run",
        "-A",
        "--no-config",
        sandbox.path("source/artifacts/mock/api/main.js"),
      ]);
      return color.output.trim() === "blue"
        ? {}
        : { gap: `the Deno app printed "${color.output.trim()}"` };
    },
  },
  {
    name: "release",
    goal:
      "one release moves both languages' libs, pins and lockfiles, and versions the .deb",
    async run(sandbox) {
      const released = await sandbox.ens("release", "next", "minor", "--yes");
      if (released.code !== 0) return failed("ens release next", released);

      const books = await sandbox.read("source/core/books/Cargo.toml");
      if (!books.includes('version = "0.2.0"')) {
        return { gap: "the crate wasn't stamped" };
      }
      const cli = await sandbox.read("source/apps/mock/cli/Cargo.toml");
      if (!cli.includes('path = "../../../core/books", version = "0.2.0"')) {
        return { gap: "the Rust app wasn't repinned" };
      }
      const press = JSON.parse(
        await sandbox.read("source/core/press/deno.json"),
      );
      if (press.version !== "0.2.0") {
        return { gap: "the Deno lib wasn't stamped" };
      }
      const api = JSON.parse(
        await sandbox.read("source/apps/mock/api/deno.json"),
      );
      if (api.imports["@tally/press"] !== "jsr:@tally/press@^0.2.0") {
        return { gap: "the Deno app wasn't repinned" };
      }
      const locked = await sandbox.ens(
        "exec",
        "cargo",
        "metadata",
        "--locked",
        "--format-version",
        "1",
      );
      if (locked.code !== 0) {
        return { gap: "Cargo.lock is stale after release" };
      }
      const denoLocked = await sandbox.ens(
        "exec",
        "deno",
        "cache",
        "--frozen",
        "--minimum-dependency-age",
        "0",
        "source/apps/mock/api/main.ts",
      );
      if (denoLocked.code !== 0) {
        return { gap: `deno.lock is stale: ${Sandbox.reason(denoLocked)}` };
      }
      const debs = await packaged(sandbox, "Tally_0.2.0_*.deb");
      if (debs.length === 0) {
        return { gap: "no Tally_0.2.0 .deb from the release" };
      }
      const dirt = await uncommitted(sandbox);
      if (dirt !== "") {
        return { gap: `left uncommitted: ${dirt.slice(0, 120)}` };
      }
      const tags = await sandbox.run("git", ["tag", "--list", "0.2.0"]);
      return tags.output.trim() === "0.2.0" ? {} : { gap: "0.2.0 not tagged" };
    },
  },
  {
    name: "mixed-lib",
    goal:
      "ens lib new defaults to the first language and --ecosystem picks another",
    async run(sandbox) {
      const first = await sandbox.ens("lib", "new", "nib");
      if (first.code !== 0) return failed("ens lib new nib", first);
      if (!await exists(sandbox.path("source/libs/nib/deno.json"))) {
        return { gap: "the default lib isn't a Deno package" };
      }
      const other = await sandbox.ens(
        "lib",
        "new",
        "rates",
        "--ecosystem",
        "cargo",
      );
      if (other.code !== 0) return failed("ens lib new rates", other);
      if (!await exists(sandbox.path("source/libs/rates/Cargo.toml"))) {
        return { gap: "--ecosystem cargo wrote no Cargo.toml" };
      }
      const clash = sandbox.path("source/libs/rates/deno.json");
      await Deno.writeTextFile(clash, json({ name: "@tally/rates" }));
      const refused = await sandbox.ens(
        "lib",
        "publish",
        "rates",
        "local",
        "0.2.0",
      );
      return refused.output.includes("more than one ecosystem") ? {} : {
        gap: `two manifests in one lib weren't refused: ${
          Sandbox.reason(refused)
        }`,
      };
    },
  },
  {
    name: "clean-layout",
    goal: "nothing but package manifests outside .ensemble, built or brand new",
    async run(sandbox) {
      const built = await sandbox.ens("build", "mock/cli");
      if (built.code !== 0) return failed("ens build", built);
      const builtStrays = await strayEntries(sandbox.root);
      if (builtStrays.length > 0) {
        return { gap: `the project has ${builtStrays.join(", ")}` };
      }
      const { outcome, fresh } = await initialize(sandbox);
      if (outcome.code !== 0) return failed("ens init", outcome);
      const strays = await strayEntries(fresh);
      return strays.length === 0
        ? {}
        : { gap: `ens init wrote ${strays.join(", ")}` };
    },
  },
];

class Report {
  private gaps = 0;

  record(scenario: Scenario, finding: Finding, seconds: number): void {
    if (finding.gap) this.gaps++;
    const verdict = finding.gap ? "GAP" : "ok ";
    const detail = finding.gap ?? finding.note ?? "";
    console.log(
      `${verdict}  ${scenario.name.padEnd(15)} ${
        seconds.toFixed(0).padStart(4)
      }s  ${scenario.goal}`,
    );
    if (detail) console.log(`     -> ${detail}`);
  }

  finish(total: number): void {
    console.log(
      `\n${total - this.gaps}/${total} goals met, ${this.gaps} gaps.`,
    );
    Deno.exitCode = this.gaps === 0 ? 0 : 1;
  }
}

const flags = parseArgs(Deno.args, { string: ["sandbox", "only"] });
if (!flags.sandbox) {
  throw new Error("Pass --sandbox <dir>: scenarios run in copies made there.");
}
const only = flags.only?.split(",");
const selected = SCENARIOS.filter((s) => !only || only.includes(s.name));

const report = new Report();
for (const scenario of selected) {
  const started = performance.now();
  const sandbox = await Sandbox.create(
    flags.sandbox,
    scenario.name,
    scenario.legacy ?? false,
  );
  const finding = await scenario.run(sandbox);
  report.record(scenario, finding, (performance.now() - started) / 1000);
  if (!finding.gap) await sandbox.discard();
}
report.finish(selected.length);
