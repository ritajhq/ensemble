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

/** ~/.config/ensemble (or $XDG_CONFIG_HOME/ensemble) — deliberately outside any project repo, since profiles hold secrets. */
function getConfigDir(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  const base = xdg && xdg.length > 0 ? xdg : (home ? join(home, ".config") : undefined);
  if (!base) {
    throw new Error("Could not determine a config directory (HOME/XDG_CONFIG_HOME/USERPROFILE not set).");
  }
  return join(base, "ensemble");
}

function getRemotesFilePath(): string {
  return join(getConfigDir(), "remotes.yaml");
}

async function loadRemotesFile(): Promise<RemotesFile> {
  const path = getRemotesFilePath();
  if (!await exists(path, { isFile: true })) return {};
  const parsed = parseYaml(await Deno.readTextFile(path));
  return (parsed ?? {}) as RemotesFile;
}

async function saveRemotesFile(data: RemotesFile): Promise<void> {
  const dir = getConfigDir();
  await ensureDir(dir);
  const path = getRemotesFilePath();
  await Deno.writeTextFile(path, stringifyYaml(data as Record<string, unknown>));
  try {
    await Deno.chmod(path, 0o600);
  } catch {
    // best-effort — chmod isn't supported on every platform (e.g. Windows)
  }
}

/** Creates or overwrites a named remote profile, used by `ens workflow --remote <name>`. */
export async function setRemoteProfile(name: string, profile: RemoteProfile): Promise<void> {
  const data = await loadRemotesFile();
  data.profiles = { ...data.profiles, [name]: profile };
  await saveRemotesFile(data);
}

/** Resolves a remote profile by name, throwing a clear error if it hasn't been configured. */
export async function getRemoteProfile(name: string): Promise<RemoteProfile> {
  const data = await loadRemotesFile();
  const profile = data.profiles?.[name];
  if (!profile) {
    throw new Error(`Remote profile "${name}" not found. Run \`ens workflow remote configure ${name}\` first.`);
  }
  return profile;
}
