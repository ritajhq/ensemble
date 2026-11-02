import { dirname, join, relative, SEPARATOR } from "@std/path";
import { ensureDir, exists, expandGlob } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import type * as KitSdk from "@ensemble/kit-sdk";
import { Manifest } from "./manifest.ts";

type Package = KitSdk.Ecosystem.Package;
type Link = KitSdk.Ecosystem.Link;
type StampTarget = KitSdk.Ecosystem.StampTarget;
type Invocation = KitSdk.Ecosystem.Invocation;

const ROOT_MANIFEST = `[workspace]
resolver = "2"
members = []
`;

interface Dependency {
  path?: string;
  package?: string;
}

interface CargoToml {
  package?: { name?: string };
  dependencies?: Record<string, Dependency | string>;
  "dev-dependencies"?: Record<string, Dependency | string>;
  "build-dependencies"?: Record<string, Dependency | string>;
  target?: Record<string, CargoToml>;
}

function linksIn(
  dependencies: Record<string, Dependency | string> | undefined,
): Link[] {
  const links: Link[] = [];
  for (const [specifier, dependency] of Object.entries(dependencies ?? {})) {
    if (typeof dependency === "string" || dependency.path === undefined) {
      continue;
    }
    links.push({ specifier, target: dependency.package ?? specifier });
  }
  return links;
}

/**
 * The project's Cargo workspace, whose root manifest and lockfile live in
 * `.ensemble/ecosystems/cargo` so that `source/` holds only crates' own
 * manifests. Cargo allows that as long as each crate states where its root is,
 * which `sync` sees to, along with listing every crate as a member.
 */
export class Workspace {
  private readonly root: string;

  constructor(private readonly repoRoot: string) {
    this.root = join(repoRoot, ".ensemble", "ecosystems", "cargo");
  }

  async initialize(): Promise<void> {
    await ensureDir(this.root);
    await Deno.writeTextFile(join(this.root, "Cargo.toml"), ROOT_MANIFEST);
  }

  /** Lists every crate under `source/` as a member, and points each at this root. */
  async sync(): Promise<void> {
    const members = [];
    const manifests = expandGlob("source/**/Cargo.toml", {
      root: this.repoRoot,
      exclude: [
        "source/artifacts/**",
        "**/target/**",
        "**/node_modules/**",
        "**/testdata/**",
      ],
    });
    for await (const manifest of manifests) {
      const directory = dirname(manifest.path);
      if (!await this.packageAt(directory)) continue;
      members.push(this.relativeTo(this.root, directory));
      await this.rewrite(
        manifest.path,
        (text) =>
          new Manifest(text).withWorkspace(
            this.relativeTo(directory, this.root),
          ),
      );
    }
    await this.rewrite(
      join(this.root, "Cargo.toml"),
      (text) => new Manifest(text).withMembers(members.sort()),
    );
  }

  /** Cargo finds this root from inside a crate by itself, and from here otherwise. */
  invocation(
    tool: string,
    args: readonly string[],
  ): Promise<Invocation | undefined> {
    return Promise.resolve(
      tool === "cargo" ? { args, cwd: this.root } : undefined,
    );
  }

  async packageAt(directory: string): Promise<Package | undefined> {
    const path = join(directory, "Cargo.toml");
    if (!await exists(path, { isFile: true })) return undefined;
    const manifest = parseToml(await Deno.readTextFile(path)) as CargoToml;
    if (!manifest.package) return undefined;
    const sections = [manifest, ...Object.values(manifest.target ?? {})];
    return {
      name: manifest.package.name,
      directory,
      links: sections.flatMap((section) => [
        ...linksIn(section.dependencies),
        ...linksIn(section["dev-dependencies"]),
        ...linksIn(section["build-dependencies"]),
      ]),
    };
  }

  /** Stamps the targets that are crates, repins the crates depending on them, and brings `Cargo.lock` along. */
  async stamp(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]> {
    const crates = [];
    for (const target of targets) {
      if (await this.packageAt(target.directory)) crates.push(target);
    }
    if (crates.length === 0) return [];

    const plain = version.replace(/^v/, "");
    for (const { directory } of crates) {
      const path = join(directory, "Cargo.toml");
      const text = await Deno.readTextFile(path);
      await Deno.writeTextFile(
        path,
        new Manifest(text).withVersion(plain),
      );
    }

    const names = crates.map((crate) => crate.name);
    const changed = [];
    for (const path of await this.manifests()) {
      const before = await Deno.readTextFile(path);
      const after = new Manifest(before).repinned(names, plain);
      if (after === before) continue;
      await Deno.writeTextFile(path, after);
      changed.push(path);
    }
    await this.cargo("metadata", "--format-version", "1");
    return changed;
  }

  async scaffoldLibrary(directory: string, name: string): Promise<void> {
    await this.cargo(
      "new",
      "--lib",
      "--vcs",
      "none",
      "--name",
      name,
      directory,
    );
    await this.sync();
  }

  async lockfiles(): Promise<string[]> {
    const lockfile = join(this.root, "Cargo.lock");
    return await exists(lockfile, { isFile: true }) ? [lockfile] : [];
  }

  /** Every member's `Cargo.toml` and the root's, whose `[workspace.dependencies]` may pin a target too. */
  private async manifests(): Promise<string[]> {
    const metadata = JSON.parse(
      await this.cargo("metadata", "--no-deps", "--format-version", "1"),
    ) as { packages: { manifest_path: string }[] };
    return [
      join(this.root, "Cargo.toml"),
      ...metadata.packages.map((crate) => crate.manifest_path),
    ];
  }

  private async rewrite(
    path: string,
    change: (text: string) => string,
  ): Promise<void> {
    const before = await Deno.readTextFile(path);
    const after = change(before);
    if (after !== before) await Deno.writeTextFile(path, after);
  }

  private relativeTo(from: string, to: string): string {
    return relative(from, to).replaceAll(SEPARATOR, "/");
  }

  private async cargo(...args: string[]): Promise<string> {
    const { code, stdout, stderr } = await new Deno.Command("cargo", {
      args: ["--quiet", ...args],
      cwd: this.root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    const decoder = new TextDecoder();
    if (code !== 0) {
      throw new Error(
        `cargo ${args[0]} failed: ${decoder.decode(stderr).trim()}`,
      );
    }
    return decoder.decode(stdout);
  }
}
