import { copy, exists, expandGlob } from "jsr:@std/fs@1.0.24";
import { dirname, fromFileUrl, join } from "jsr:@std/path@1.1.6";
import { parseArgs } from "jsr:@std/cli@1.0.32/parse-args";

const MOCKS = dirname(fromFileUrl(import.meta.url));
const REPO = dirname(MOCKS);
const CARGO_TARGET_DIR = join(MOCKS, ".cargo-target");

interface Outcome {
  readonly code: number;
  readonly output: string;
}

/** One throwaway copy of a mock: its own git repository, with `0.1.0` tagged and pushed to a local `origin`. */
class Sandbox {
  private readonly log: string[] = [];

  private constructor(
    readonly root: string,
    private readonly logPath: string,
  ) {}

  static async create(parent: string, scenario: string): Promise<Sandbox> {
    const directory = join(parent, scenario);
    await Deno.remove(directory, { recursive: true }).catch(() => {});
    const root = join(directory, "tally");
    await copy(join(MOCKS, "tally"), root);
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
    return this.run(Deno.execPath(), [
      "run",
      "-A",
      "-q",
      "--config",
      join(REPO, "deno.json"),
      "--minimum-dependency-age",
      "0",
      join(REPO, "source/apps/cli/main.ts"),
      ...args,
    ]);
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

/** What a scenario found: the user's goal was met, or `gap` says how it wasn't. */
type Finding = { readonly gap?: string; readonly note?: string };

interface Scenario {
  readonly name: string;
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

/** Runs `ens init` next to the mock, naming the new project `fresh`. */
function initialize(sandbox: Sandbox): Promise<Outcome> {
  return sandbox.run(
    Deno.execPath(),
    [
      "run",
      "-A",
      "-q",
      "--config",
      join(REPO, "deno.json"),
      "--minimum-dependency-age",
      "0",
      join(REPO, "source/apps/cli/main.ts"),
      "init",
    ],
    dirname(sandbox.root),
    "fresh\n",
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
    goal: "ens init can start a project without creating Deno's files",
    async run(sandbox) {
      const parent = dirname(sandbox.root);
      const initialized = await initialize(sandbox);
      if (initialized.code !== 0) return failed("ens init", initialized);
      return await exists(join(parent, "fresh/deno.json"))
        ? { gap: "always writes a root deno.json" }
        : {};
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
  const sandbox = await Sandbox.create(flags.sandbox, scenario.name);
  const finding = await scenario.run(sandbox);
  report.record(scenario, finding, (performance.now() - started) / 1000);
}
report.finish(selected.length);
