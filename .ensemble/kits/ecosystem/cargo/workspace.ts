import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import type * as KitSdk from "@ensemble/kit-sdk";
import { Manifest } from "./manifest.ts";

type Package = KitSdk.Ecosystem.Package;
type Link = KitSdk.Ecosystem.Link;
type StampTarget = KitSdk.Ecosystem.StampTarget;

// No member globs: cargo fails on one that matches nothing yet, or on any
// directory it matches without a Cargo.toml. `cargo new` lists each crate instead.
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

/** The project's Cargo workspace, whose root files live in `source/` so the repository's root holds nothing specific to Rust. */
export class Workspace {
  private readonly root: string;

  constructor(repoRoot: string) {
    this.root = join(repoRoot, "source");
  }

  async initialize(): Promise<void> {
    await Deno.writeTextFile(join(this.root, "Cargo.toml"), ROOT_MANIFEST);
    await Deno.writeTextFile(join(this.root, ".gitignore"), "target/\n");
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

  /** `cargo new` adds the crate to the workspace's members itself, unless a glob already covers it. */
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
