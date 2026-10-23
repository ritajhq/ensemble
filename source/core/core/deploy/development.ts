import { CATEGORIES, type Workload } from "./workload.ts";

/** How a sync rule keeps a container's copy of a host path current — `sync` copies changes over, `sync+restart` additionally restarts the container so the process picks them up. Also the `development` block's grouping key for rules of that action. */
export type SyncAction = "sync" | "sync+restart";

/** One `develop.watch`-equivalent rule: keep `path` (inside the deployed container) current with `app`'s source (relative to that app's own source directory) while `--watch` runs. */
export interface SyncRule {
  readonly app: string;
  readonly path: string;
  readonly ignore: readonly string[];
}

/** A manifest resource's typed `development:` block (Section 4) — portable, interface-level developer intent ("sync this there"), the same across every kit. Rules are grouped by `SyncAction` (their key in the block), rather than carrying the action per rule. A kit's realization decides how (or whether) to honor it; this type and its parser only describe what a manifest may say. */
export interface DevelopmentBlock {
  readonly sync: readonly SyncRule[];
  readonly "sync+restart": readonly SyncRule[];
}

export class DevelopmentBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentBlockError";
  }
}

const SYNC_ACTIONS: readonly SyncAction[] = ["sync", "sync+restart"];
const KNOWN_TOP_LEVEL_KEYS = new Set<string>(SYNC_ACTIONS);
const KNOWN_SYNC_KEYS = new Set(["app", "path", "ignore"]);

/**
 * Parses and strictly validates a resource's `development` param against
 * Section 4's schema — unknown keys and malformed rules are rejected, not
 * silently ignored. Called only by a provisioner that actually honors the
 * block during render (Phase 5); every other path leaves the raw
 * `development` value alone (the contract's own shallow `type: "object"`
 * check is all that runs otherwise). Throws `DevelopmentBlockError` naming
 * the first violation.
 */
export function parseDevelopmentBlock(raw: unknown): DevelopmentBlock {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DevelopmentBlockError("development must be a mapping.");
  }
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      throw new DevelopmentBlockError(`development has no key "${key}".`);
    }
  }

  return {
    sync: parseSyncRules(record.sync, "sync"),
    "sync+restart": parseSyncRules(record["sync+restart"], "sync+restart"),
  };
}

function parseSyncRules(
  raw: unknown,
  action: SyncAction,
): readonly SyncRule[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new DevelopmentBlockError(`development.${action} must be a list.`);
  }
  return raw.map((entry, index) => parseSyncRule(entry, action, index));
}

function parseSyncRule(
  raw: unknown,
  action: SyncAction,
  index: number,
): SyncRule {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DevelopmentBlockError(
      `development.${action}[${index}] must be a mapping.`,
    );
  }
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_SYNC_KEYS.has(key)) {
      throw new DevelopmentBlockError(
        `development.${action}[${index}] has no key "${key}".`,
      );
    }
  }

  if (typeof record.app !== "string" || record.app.length === 0) {
    throw new DevelopmentBlockError(
      `development.${action}[${index}] requires "app" as a non-empty string.`,
    );
  }
  if (typeof record.path !== "string" || record.path.length === 0) {
    throw new DevelopmentBlockError(
      `development.${action}[${index}] requires "path" as a non-empty string.`,
    );
  }

  const ignore = parseIgnore(record.ignore, action, index);

  return { app: record.app, path: record.path, ignore };
}

function parseIgnore(
  raw: unknown,
  action: SyncAction,
  index: number,
): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
    throw new DevelopmentBlockError(
      `development.${action}[${index}] "ignore" must be a list of strings.`,
    );
  }
  return raw as string[];
}

/**
 * Every app named by any resource's `development` sync rules (either
 * action) in this workload — the set a `--watch` session needs to keep
 * freshly built so compose's own file-watching sync has something real to
 * copy in. Reused, not re-derived, by whoever spawns the companion
 * `ens build --watch` process per app (`@ensemble/core`'s `runDeploy`) —
 * this is a pure function of the workload alone, independent of which kit
 * or target is deploying it.
 */
export function discoverWatchedApps(workload: Workload): ReadonlySet<string> {
  const apps = new Set<string>();
  for (const category of CATEGORIES) {
    const resources = workload[category] as
      | Readonly<Record<string, { params?: Readonly<Record<string, unknown>> }>>
      | undefined;
    if (!resources) continue;
    for (const declaration of Object.values(resources)) {
      const development = declaration.params?.development;
      if (development === undefined) continue;
      const block = parseDevelopmentBlock(development);
      for (const action of SYNC_ACTIONS) {
        for (const rule of block[action]) {
          apps.add(rule.app);
        }
      }
    }
  }
  return apps;
}
