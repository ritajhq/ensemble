/** How a sync rule keeps a container's copy of a host path current — `sync` copies changes over, `sync+restart` additionally restarts the container so the process picks them up. */
export type SyncAction = "sync" | "sync+restart";

/** One `develop.watch`-equivalent rule: keep `path` (inside the deployed container) current with `app`'s source (relative to that app's own source directory) while `--watch` runs. */
export interface SyncRule {
  readonly app: string;
  readonly path: string;
  readonly action: SyncAction;
  readonly ignore: readonly string[];
}

/** A manifest resource's typed `development:` block (Section 4) — portable, interface-level developer intent ("sync this there"), the same across every kit. A kit's realization decides how (or whether) to honor it; this type and its parser only describe what a manifest may say. */
export interface DevelopmentBlock {
  readonly sync: readonly SyncRule[];
}

export class DevelopmentBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentBlockError";
  }
}

const KNOWN_TOP_LEVEL_KEYS = new Set(["sync"]);
const KNOWN_SYNC_KEYS = new Set(["app", "path", "action", "ignore"]);
const SYNC_ACTIONS: ReadonlySet<string> = new Set<SyncAction>([
  "sync",
  "sync+restart",
]);

/**
 * Parses and strictly validates a resource's `development` param against
 * Section 4's schema — unknown keys and malformed `action` values are
 * rejected, not silently ignored. Called only by a provisioner that actually
 * honors the block during render (Phase 5); every other path leaves the raw
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
  if (record.sync === undefined) {
    throw new DevelopmentBlockError('development requires "sync".');
  }
  if (!Array.isArray(record.sync)) {
    throw new DevelopmentBlockError("development.sync must be a list.");
  }

  return {
    sync: record.sync.map((entry, index) => parseSyncRule(entry, index)),
  };
}

function parseSyncRule(raw: unknown, index: number): SyncRule {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DevelopmentBlockError(
      `development.sync[${index}] must be a mapping.`,
    );
  }
  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_SYNC_KEYS.has(key)) {
      throw new DevelopmentBlockError(
        `development.sync[${index}] has no key "${key}".`,
      );
    }
  }

  if (typeof record.app !== "string" || record.app.length === 0) {
    throw new DevelopmentBlockError(
      `development.sync[${index}] requires "app" as a non-empty string.`,
    );
  }
  if (typeof record.path !== "string" || record.path.length === 0) {
    throw new DevelopmentBlockError(
      `development.sync[${index}] requires "path" as a non-empty string.`,
    );
  }

  const action = record.action ?? "sync";
  if (typeof action !== "string" || !SYNC_ACTIONS.has(action)) {
    throw new DevelopmentBlockError(
      `development.sync[${index}] "action" must be "sync" or "sync+restart".`,
    );
  }

  const ignore = parseIgnore(record.ignore, index);

  return {
    app: record.app,
    path: record.path,
    action: action as SyncAction,
    ignore,
  };
}

function parseIgnore(raw: unknown, index: number): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
    throw new DevelopmentBlockError(
      `development.sync[${index}] "ignore" must be a list of strings.`,
    );
  }
  return raw as string[];
}
