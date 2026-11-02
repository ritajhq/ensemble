import { copy, ensureDir, exists, expandGlob } from "jsr:@std/fs@1.0.24";
import { dirname, fromFileUrl, join } from "jsr:@std/path@1.1.6";
import { parseArgs } from "jsr:@std/cli@1.0.32/parse-args";

const MOCKS = dirname(fromFileUrl(import.meta.url));
const REPO = dirname(MOCKS);
const CARGO_TARGET_DIR = join(MOCKS, ".cargo-target");

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
    join(REPO, "deno.json"),
    "--minimum-dependency-age",
    "0",
    join(REPO, "source/apps/cli/main.ts"),
    ...args,
  ];
}

/** One throwaway copy of a mock: its own git repository, with `0.1.0` tagged and pushed to a local `origin`. */
class Sandbox {
  private readonly log: string[] = [];

  private constructor(
    readonly root: string,
    private readonly logPath: string,
  ) {}

  static async create(
    parent: string,
    scenario: string,
    mock: string,
  ): Promise<Sandbox> {
    const directory = join(parent, scenario);
    await Deno.remove(directory, { recursive: true }).catch(() => {});
    const root = join(directory, mock);
    await copy(join(MOCKS, mock), root);
    await vendorEcosystemKits(root);
    const sandbox = new Sandbox(root, join(directory, "output.log"));

    const origin = join(directory, "origin.git");
    await sandbox.run("git", ["init", "-q", "--bare", origin]);
    await sandbox.run("git", ["init", "-q", "-b", "main"]);
    await sandbox.run("git", ["remote", "add", "origin", origin]);
    await sandbox.run("git", ["add", "."]);
    await sandbox.run("git", ["commit", "-q", "-m", "chore: mock project"]);
    await sandbox.run("git", ["tag", "0.1.0"]);
    await sandbox.run("git", ["push", "-q", "origin", "main", "0.1.0"]);
    return sandbox;
  }

  ens(...args: string[]): Promise<Outcome> {
    return this.run(Deno.execPath(), ensArgs(...args));
  }

  /** Cargo's root files live under `source/`, so that's where it runs from. */
  cargo(...args: string[]): Promise<Outcome> {
    return this.run("cargo", args, this.path("source"));
  }

  async run(
    command: string,
    args: string[],
    cwd: string = this.root,
    input?: string,
  ): Promise<Outcome> {
    this.log.push(`$ ${command} ${args.join(" ")}`);
    const child = new Deno.Command(command, {
      args,
      cwd,
      stdin: input === undefined ? "null" : "piped",
      stdout: "piped",
      stderr: "piped",
      env: {
        CARGO_TARGET_DIR,
        GIT_AUTHOR_NAME: "mock",
        GIT_AUTHOR_EMAIL: "mock@example.invalid",
        GIT_COMMITTER_NAME: "mock",
        GIT_COMMITTER_EMAIL: "mock@example.invalid",
      },
    }).spawn();
    if (input !== undefined) {
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(input));
      await writer.close();
    }
    const { code, stdout, stderr } = await child.output();
    const decoder = new TextDecoder();
    const output = decoder.decode(stdout) + decoder.decode(stderr);
    this.log.push(output, `(exit ${code})`);
    await Deno.writeTextFile(this.logPath, this.log.join("\n"));
    return { code, output };
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
 * Copies this working tree's ecosystem kits into a mock that declares them, as
 * `ens kit install` would, and links every kit to this tree's kit SDK: they need
 * contracts a published release may not carry yet.
 */
async function vendorEcosystemKits(root: string): Promise<void> {
  const config = await Deno.readTextFile(
    join(root, ".ensemble", "config.yaml"),
  );
  if (config.includes("- cargo")) {
    await copy(
      join(REPO, ".ensemble", "kits", "ecosystem", "cargo"),
      join(root, ".ensemble", "kits", "ecosystem", "cargo"),
    );
  }
  await linkKitsToWorkingTree(join(root, ".ensemble", "kits"));
}

async function linkKitsToWorkingTree(kits: string): Promise<void> {
  const manifests = expandGlob("*/*/deno.json", { root: kits });
  for await (const manifest of manifests) {
    await linkToWorkingTree(dirname(manifest.path));
  }
}

async function linkToWorkingTree(kit: string): Promise<void> {
  await Deno.remove(join(kit, "deno.lock")).catch(() => {});
  const manifest = JSON.parse(
    await Deno.readTextFile(join(kit, "deno.json")),
  );
  manifest.links = ["core", "host", "kit-sdk"].map((member) =>
    join(REPO, "source", "core", member)
  );
  await Deno.writeTextFile(join(kit, "deno.json"), JSON.stringify(manifest));
}

/** What a scenario found: the user's goal was met, or `gap` says how it wasn't. */
type Finding = { readonly gap?: string; readonly note?: string };

interface Scenario {
  readonly name: string;
  /** Which mock it runs against: `tally` unless it says otherwise. */
  readonly mock?: string;
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

/**
 * Runs `ens init fresh` next to the mock, fetching kits from a scratch copy of
 * this working tree's, linked to its kit SDK like `vendorEcosystemKits`.
 */
async function initialize(
  sandbox: Sandbox,
  ...flags: string[]
): Promise<Outcome> {
  const parent = dirname(sandbox.root);
  const repository = join(parent, "kits-repo");
  const kits = join(repository, ".ensemble", "kits");
  await copy(join(REPO, ".ensemble", "kits"), kits);
  await linkKitsToWorkingTree(kits);
  await sandbox.run("git", ["init", "-q", "-b", "main"], repository);
  await sandbox.run("git", ["add", "."], repository);
  await sandbox.run("git", ["commit", "-q", "-m", "feat: kits"], repository);
  return await sandbox.run(
    Deno.execPath(),
    ensArgs(
      "init",
      "fresh",
      "--kits-from",
      `file://${repository}@main`,
      ...flags,
    ),
    parent,
  );
}

/** What a project's root may hold: anything else is a language's file that belongs under `source/`. */
const ROOT_ENTRIES = new Set([
  ".ensemble",
  ".git",
  ".gitignore",
  "README.md",
  "ci",
  "docs",
  "source",
]);

async function strayRootEntries(root: string): Promise<string[]> {
  const strays = [];
  for await (const entry of Deno.readDir(root)) {
    if (!ROOT_ENTRIES.has(entry.name)) strays.push(entry.name);
  }
  return strays;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "build-cli",
    goal: "ens build a Rust CLI, and the result runs",
    async run(sandbox) {
      const built = await sandbox.ens("build", "tally-cli");
      if (built.code !== 0) return failed("ens build", built);
      const ran = await sandbox.run(
        sandbox.path("source/artifacts/tally-cli/tally-cli"),
        ["1.25", "2.5"],
      );
      if (ran.output.trim() !== "3.75") {
        return { gap: `tally-cli printed "${ran.output.trim()}"` };
      }
      return {};
    },
  },
  {
    name: "pack-cli",
    goal: "ens pack builds the CLI first, then archives it",
    async run(sandbox) {
      const packed = await sandbox.ens("pack", "tally-cli", "tarball");
      if (packed.code !== 0) return failed("ens pack", packed);
      const files = await packaged(sandbox, "tally-cli.tar.gz");
      return files.length > 0 ? {} : { gap: "no tally-cli.tar.gz produced" };
    },
  },
  {
    name: "shell-alone",
    goal:
      "ens build the Tauri shell alone, without building its web app by hand first",
    async run(sandbox) {
      const built = await sandbox.ens("build", "tally-desktop/shell");
      return built.code === 0 ? {} : failed("ens build", built);
    },
  },
  {
    name: "pack-desktop",
    goal: "ens pack builds web, then the shell, then a .deb",
    async run(sandbox) {
      const packed = await sandbox.ens("pack", "tally-desktop", "tauri");
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
        "tally-desktop",
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
      const created = await sandbox.ens("app", "create", "cargo", "tally-api");
      if (created.code !== 0) return failed("ens app create", created);
      const built = await sandbox.ens("build", "tally-api");
      return built.code === 0 ? {} : failed("ens build", built);
    },
  },
  {
    name: "lib-new",
    goal: "ens lib new scaffolds a crate, and the workspace still resolves",
    async run(sandbox) {
      const created = await sandbox.ens("lib", "new", "fees");
      if (created.code !== 0) return failed("ens lib new", created);
      if (await exists(sandbox.path("source/libs/fees/deno.json"))) {
        return { gap: "wrote source/libs/fees/deno.json, not a Cargo.toml" };
      }
      const resolved = await sandbox.cargo("metadata", "--no-deps");
      return resolved.code === 0 ? {} : failed("cargo metadata", resolved);
    },
  },
  {
    name: "lib-publish",
    goal: "ens lib publish packages a Rust lib through its kit",
    async run(sandbox) {
      const published = await sandbox.ens(
        "lib",
        "publish",
        "rounding",
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
      const manifest = sandbox.path("source/libs/rounding/Cargo.toml");
      const text = await Deno.readTextFile(manifest);
      await Deno.writeTextFile(
        manifest,
        `${text}\n[dev-dependencies]\ntally-ledger = { path = "../../core/ledger" }\n`,
      );
      const published = await sandbox.ens(
        "lib",
        "publish",
        "rounding",
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
    goal: "ens kit install works in a project with no deno.lock",
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
    name: "release",
    goal:
      "ens release stamps crates, repins dependents, keeps Cargo.lock in the commit, tags and pushes",
    async run(sandbox) {
      const released = await sandbox.ens("release", "next", "minor", "--yes");
      if (released.code !== 0) return failed("ens release next", released);

      const ledger = await sandbox.read("source/core/ledger/Cargo.toml");
      if (!ledger.includes('version = "0.2.0"')) {
        return { gap: "tally-ledger's version wasn't stamped to 0.2.0" };
      }
      const cli = await sandbox.read("source/apps/tally-cli/Cargo.toml");
      if (!cli.includes('path = "../../core/ledger", version = "0.2.0"')) {
        return { gap: "tally-cli wasn't repinned to tally-ledger 0.2.0" };
      }
      const resolved = await sandbox.cargo("metadata", "--no-deps");
      if (resolved.code !== 0) return failed("cargo metadata", resolved);
      const locked = await sandbox.cargo(
        "metadata",
        "--locked",
        "--format-version",
        "1",
      );
      if (locked.code !== 0) {
        return { gap: "Cargo.lock is stale after release" };
      }
      const dirt = await sandbox.run("git", ["status", "--porcelain"]);
      if (dirt.output.trim() !== "") {
        return { gap: `left uncommitted: ${dirt.output.trim().slice(0, 120)}` };
      }
      const tags = await sandbox.run("git", ["tag", "--list", "0.2.0"]);
      return tags.output.trim() === "0.2.0" ? {} : { gap: "0.2.0 not tagged" };
    },
  },
  {
    name: "init",
    goal: "ens init starts a Rust project with no Deno files, ready for a lib",
    async run(sandbox) {
      const initialized = await initialize(sandbox, "--ecosystem", "cargo");
      if (initialized.code !== 0) return failed("ens init", initialized);
      const fresh = join(dirname(sandbox.root), "fresh");
      for (const file of ["deno.json", "source/deno.json"]) {
        if (await exists(join(fresh, file))) return { gap: `wrote ${file}` };
      }
      const created = await sandbox.run(
        Deno.execPath(),
        ensArgs("lib", "new", "fees"),
        fresh,
      );
      if (created.code !== 0) return failed("ens lib new", created);
      const resolved = await sandbox.run(
        "cargo",
        ["metadata", "--no-deps", "--format-version", "1"],
        join(fresh, "source"),
      );
      if (resolved.code !== 0) return failed("cargo metadata", resolved);
      return resolved.output.includes('"name":"fees"')
        ? {}
        : { gap: "the new lib isn't a member of the workspace" };
    },
  },
  {
    name: "init-deno",
    goal: "ens init's default Deno project builds an app using a new lib",
    async run(sandbox) {
      const initialized = await initialize(sandbox);
      if (initialized.code !== 0) return failed("ens init", initialized);
      const fresh = join(dirname(sandbox.root), "fresh");
      const ens = (...args: string[]) =>
        sandbox.run(Deno.execPath(), ensArgs(...args), fresh);

      const app = await ens("app", "create", "deno.bundle", "api");
      if (app.code !== 0) return failed("ens app create", app);
      const lib = await ens("lib", "new", "fees");
      if (lib.code !== 0) return failed("ens lib new", lib);
      // Deno only links a workspace member by a scoped name.
      await Deno.writeTextFile(
        join(fresh, "source/libs/fees/deno.json"),
        JSON.stringify({ name: "@fresh/fees", exports: "./index.ts" }),
      );
      await Deno.writeTextFile(
        join(fresh, "source/libs/fees/index.ts"),
        "export const FEE = 7;\n",
      );
      const entry = join(fresh, "source/apps/api/main.ts");
      await Deno.writeTextFile(
        entry,
        `import { FEE } from "@fresh/fees";\nconsole.log(FEE);\n`,
      );
      const built = await ens("build", "api");
      if (built.code !== 0) return failed("ens build", built);
      const ran = await sandbox.run(
        Deno.execPath(),
        ["run", "-A", entry],
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
    name: "deno-release",
    mock: "quill",
    goal: "a Deno project declaring no ecosystems still releases as before",
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
      const dirt = await sandbox.run("git", ["status", "--porcelain"]);
      if (dirt.output.trim() !== "") {
        return { gap: `left uncommitted: ${dirt.output.trim().slice(0, 120)}` };
      }
      const tags = await sandbox.run("git", ["tag", "--list", "0.2.0"]);
      return tags.output.trim() === "0.2.0" ? {} : { gap: "0.2.0 not tagged" };
    },
  },
  {
    name: "deno-lib",
    mock: "quill",
    goal: "ens lib new and its self-containment check still work for Deno",
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
    mock: "atlas",
    goal: "a Rust app and a Deno app build and run in one project",
    async run(sandbox) {
      const rust = await sandbox.ens("build", "cli");
      if (rust.code !== 0) return failed("ens build cli", rust);
      const deno = await sandbox.ens("build", "api");
      if (deno.code !== 0) return failed("ens build api", deno);
      const total = await sandbox.run(
        sandbox.path("source/artifacts/cli/atlas-cli"),
        [],
      );
      if (total.output.trim() !== "3") {
        return { gap: `the Rust app printed "${total.output.trim()}"` };
      }
      const color = await sandbox.run(Deno.execPath(), [
        "run",
        "-A",
        sandbox.path("source/artifacts/api/main.js"),
      ]);
      return color.output.trim() === "blue"
        ? {}
        : { gap: `the Deno app printed "${color.output.trim()}"` };
    },
  },
  {
    name: "mixed-release",
    mock: "atlas",
    goal: "one release moves both languages' libs, pins and lockfiles together",
    async run(sandbox) {
      // A Deno lockfile has to exist for the release to carry it.
      const built = await sandbox.ens("build", "api");
      if (built.code !== 0) return failed("ens build api", built);
      if (!await exists(sandbox.path("source/deno.lock"))) {
        return { gap: "building wrote no source/deno.lock" };
      }
      await sandbox.run("git", ["add", "."]);
      await sandbox.run("git", ["commit", "-q", "-m", "chore: lock"]);

      const released = await sandbox.ens("release", "next", "minor", "--yes");
      if (released.code !== 0) return failed("ens release next", released);

      const ledger = await sandbox.read("source/core/ledger/Cargo.toml");
      if (!ledger.includes('version = "0.2.0"')) {
        return { gap: "the crate wasn't stamped" };
      }
      const cli = await sandbox.read("source/apps/cli/Cargo.toml");
      if (!cli.includes('version = "0.2.0"')) {
        return { gap: "the Rust app wasn't repinned" };
      }
      const ink = JSON.parse(await sandbox.read("source/core/ink/deno.json"));
      if (ink.version !== "0.2.0") {
        return { gap: "the Deno lib wasn't stamped" };
      }
      const api = JSON.parse(await sandbox.read("source/apps/api/deno.json"));
      if (api.imports["@atlas/ink"] !== "jsr:@atlas/ink@^0.2.0") {
        return { gap: "the Deno app wasn't repinned" };
      }
      const locked = await sandbox.run(
        "cargo",
        ["metadata", "--locked", "--format-version", "1"],
        sandbox.path("source"),
      );
      if (locked.code !== 0) {
        return { gap: "Cargo.lock is stale after release" };
      }
      const denoLocked = await sandbox.run(
        Deno.execPath(),
        ["cache", "--frozen", "apps/api/main.ts"],
        sandbox.path("source"),
      );
      if (denoLocked.code !== 0) {
        return {
          gap: `deno.lock is stale after release: ${
            Sandbox.reason(denoLocked)
          }`,
        };
      }
      const dirt = await sandbox.run("git", ["status", "--porcelain"]);
      if (dirt.output.trim() !== "") {
        return { gap: `left uncommitted: ${dirt.output.trim().slice(0, 120)}` };
      }
      const tags = await sandbox.run("git", ["tag", "--list", "0.2.0"]);
      return tags.output.trim() === "0.2.0" ? {} : { gap: "0.2.0 not tagged" };
    },
  },
  {
    name: "mixed-lib",
    mock: "atlas",
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
      const resolved = await sandbox.cargo(
        "metadata",
        "--no-deps",
        "--format-version",
        "1",
      );
      if (resolved.code !== 0) return failed("cargo metadata", resolved);
      if (!resolved.output.includes('"name":"rates"')) {
        return { gap: "the Rust lib isn't a workspace member" };
      }
      const clash = sandbox.path("source/libs/rates/deno.json");
      await Deno.writeTextFile(clash, JSON.stringify({ name: "@atlas/rates" }));
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
    name: "mixed-init",
    goal:
      "ens init starts a project in two languages, with nothing at the root",
    async run(sandbox) {
      const initialized = await initialize(
        sandbox,
        "--ecosystem",
        "deno",
        "--ecosystem",
        "cargo",
      );
      if (initialized.code !== 0) return failed("ens init", initialized);
      const fresh = join(dirname(sandbox.root), "fresh");
      for (const file of ["source/deno.json", "source/Cargo.toml"]) {
        if (!await exists(join(fresh, file))) return { gap: `no ${file}` };
      }
      const strays = await strayRootEntries(fresh);
      return strays.length === 0
        ? {}
        : { gap: `left ${strays.join(", ")} at the root` };
    },
  },
  {
    name: "clean-root",
    goal: "no language's files at the root, in a built mock or a new project",
    async run(sandbox) {
      const built = await sandbox.ens("build", "tally-cli");
      if (built.code !== 0) return failed("ens build", built);
      const builtStrays = await strayRootEntries(sandbox.root);
      if (builtStrays.length > 0) {
        return { gap: `tally has ${builtStrays.join(", ")} at its root` };
      }
      const initialized = await initialize(sandbox);
      if (initialized.code !== 0) return failed("ens init", initialized);
      const strays = await strayRootEntries(
        join(dirname(sandbox.root), "fresh"),
      );
      return strays.length === 0
        ? {}
        : { gap: `ens init wrote ${strays.join(", ")} at the root` };
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
      `${verdict}  ${scenario.name.padEnd(14)} ${
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
    scenario.mock ?? "tally",
  );
  const finding = await scenario.run(sandbox);
  report.record(scenario, finding, (performance.now() - started) / 1000);
}
report.finish(selected.length);
