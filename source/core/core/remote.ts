import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";

export interface RemoteProfile {
  url: string;
  secret: string;
}

interface RemotesFile {
  profiles?: Record<string, RemoteProfile>;
}

/** Reads and writes ~/.config/ensemble/remotes.yaml — profiles used by `ens workflow --remote <name>`. */
export class RemoteProfileStore {
  /** ~/.config/ensemble (or $XDG_CONFIG_HOME/ensemble) — deliberately outside any project repo, since profiles hold secrets. */
  private get configDir(): string {
    const xdg = Deno.env.get("XDG_CONFIG_HOME");
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    const base = xdg && xdg.length > 0 ? xdg : (home ? join(home, ".config") : undefined);
    if (!base) {
      throw new Error("Could not determine a config directory (HOME/XDG_CONFIG_HOME/USERPROFILE not set).");
    }
    return join(base, "ensemble");
  }

  private get remotesFilePath(): string {
    return join(this.configDir, "remotes.yaml");
  }

  private async loadRemotesFile(): Promise<RemotesFile> {
    const path = this.remotesFilePath;
    if (!await exists(path, { isFile: true })) return {};
    const parsed = parseYaml(await Deno.readTextFile(path));
    return (parsed ?? {}) as RemotesFile;
  }

  private async saveRemotesFile(data: RemotesFile): Promise<void> {
    const dir = this.configDir;
    await ensureDir(dir);
    const path = this.remotesFilePath;
    await Deno.writeTextFile(path, stringifyYaml(data as Record<string, unknown>));
    try {
      await Deno.chmod(path, 0o600);
    } catch {
      // best-effort — chmod isn't supported on every platform (e.g. Windows)
    }
  }

  /** Creates or overwrites a named remote profile, used by `ens workflow --remote <name>`. */
  async set(name: string, profile: RemoteProfile): Promise<void> {
    const data = await this.loadRemotesFile();
    data.profiles = { ...data.profiles, [name]: profile };
    await this.saveRemotesFile(data);
  }

  /** Resolves a remote profile by name, throwing a clear error if it hasn't been configured. */
  async get(name: string): Promise<RemoteProfile> {
    const data = await this.loadRemotesFile();
    const profile = data.profiles?.[name];
    if (!profile) {
      throw new Error(`Remote profile "${name}" not found. Run \`ens workflow remote configure ${name}\` first.`);
    }
    return profile;
  }
}
