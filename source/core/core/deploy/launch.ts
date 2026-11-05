/** What a `launch:` entry runs on this machine. `process` is a program started from a command; `desktop` is a packaged desktop app, started from its package. Other kinds (a mobile app on an emulator, a browser tab) are expected, each with the fields its target needs. */
export const LAUNCH_TYPES = ["process", "desktop"] as const;

export type LaunchType = typeof LAUNCH_TYPES[number];

/**
 * Something a `ens develop` change should restart the launch for: the output of a build or of a pack. Exactly one of
 * the two is named. Rebuilding or repacking is the build or pack kit's `--watch`; this only says which output the
 * running thing reads, so the launch restarts when that output changes.
 */
export type LaunchWatch =
  | { readonly build: string }
  | { readonly pack: string };

/**
 * A manifest's `development:` block on a launch entry, the counterpart of a deploy resource's block. Only `restart`
 * exists: telling a running program that its UI changed is the program's own dev mode, not something the manifest says.
 */
export interface LaunchDevelopment {
  readonly restart: readonly LaunchWatch[];
}

/**
 * One thing `ens develop` starts on this machine and keeps running, declared under the manifest's `launch:`. It is not
 * a deploy resource: `ens deploy` ignores it and no deploy kit sees it. Values may be literals or `${...}` references,
 * to builds (`${build.<app>}`), packs (`${pack.<ship>}`), deploy resources and other launch entries
 * (`${launch.<name>.<port>}`); which entries an entry refers to decides what starts first.
 */
export interface LaunchEntry {
  readonly type: LaunchType;
  /** `process` only: the program and its arguments. */
  readonly command?: readonly string[];
  /** `desktop` only: the package that holds the app, as a `${pack.<ship>}` reference. */
  readonly package?: string;
  /** Port name → a number, or `auto` to have one chosen when the launch starts and kept while it runs. */
  readonly ports: Readonly<Record<string, number | "auto">>;
  readonly env: Readonly<Record<string, string | number | boolean>>;
  /** Environment variable name → a declared secret, whose value the program receives as that variable. */
  readonly envSecrets: Readonly<Record<string, string>>;
  readonly development?: LaunchDevelopment;
}
