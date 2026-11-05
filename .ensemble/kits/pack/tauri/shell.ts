import { join } from "@std/path";
import { copy, ensureDir } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import * as KitSdk from "@ensemble/kit-sdk";

const TAURI_CLI = "npm:@tauri-apps/cli@2.12.4";

export type Profile = "debug" | "release";

/** The Rust crate of a Tauri app, and the `tauri build` that compiles it. */
export class Shell {
  constructor(
    private readonly directory: string,
    private readonly repoRoot: string,
    private readonly frontend: string | undefined,
    private readonly version: string | undefined,
  ) {}

  /** `tauri build --no-bundle`: the executable alone. Throws when the build fails. */
  async compile(profile: Profile): Promise<string> {
    await this.tauri(["build", "--no-bundle", ...(profile === "debug" ? ["--debug"] : [])]);
    return join(await this.targetDir(), profile, await this.crate());
  }

  /** `tauri build --bundles …`: compiles in release and bundles, in one pass. Returns the folder holding the bundles. */
  async bundle(bundles: readonly string[]): Promise<string> {
    await this.tauri(["build", "--bundles", bundles.join(",")]);
    return join(await this.targetDir(), "release", "bundle");
  }

  /** Source the crate is built from: a change to any of these needs a new binary. */
  watched(): string[] {
    return ["src", "Cargo.toml", "tauri.conf.json", "build.rs", "capabilities"].map((name) => join(this.directory, name));
  }

  /** Copies `built` to `destination` unless it is already that file, so a build that changed nothing does not look like a change. */
  async publish(built: string, destination: string): Promise<boolean> {
    const [from, to] = await Promise.all([Deno.stat(built), Deno.stat(destination).catch(() => undefined)]);
    if (to && to.size === from.size && to.mtime?.getTime() === from.mtime?.getTime()) return false;
    await ensureDir(join(destination, ".."));
    const staged = `${destination}.new`;
    await copy(built, staged, { overwrite: true });
    if (from.mtime) await Deno.utime(staged, from.atime ?? from.mtime, from.mtime);
    await Deno.rename(staged, destination);
    return true;
  }

  private async tauri(args: readonly string[]): Promise<void> {
    const deno = await KitSdk.resolveDenoExecutable();
    const { code } = await new Deno.Command(deno, {
      // This tool is the kit's, not the project's: run from inside the project it would write itself into a Deno
      // workspace's lockfile.
      args: ["run", "-A", "-q", "--no-config", TAURI_CLI, ...args, ...this.configOverride()],
      cwd: this.directory,
    }).spawn().status;
    if (code !== 0) throw new Error(`tauri ${args[0]} failed (exit code ${code}).`);
  }

  /** The frontend's build output replaces the app's configured `frontendDist`; a release's version, its `version`. */
  private configOverride(): string[] {
    const override: Record<string, unknown> = {};
    if (this.frontend) override.build = { frontendDist: this.frontend };
    if (this.version) override.version = this.version.replace(/^v/, "");
    return Object.keys(override).length === 0 ? [] : ["--config", JSON.stringify(override)];
  }

  private async crate(): Promise<string> {
    const manifest = parseToml(await Deno.readTextFile(join(this.directory, "Cargo.toml"))) as { package: { name: string } };
    return manifest.package.name;
  }

  private targetDir(): Promise<string> {
    return Promise.resolve(
      Deno.env.get("CARGO_TARGET_DIR") ?? join(this.repoRoot, ".ensemble", "ecosystems", "cargo", "target"),
    );
  }
}
