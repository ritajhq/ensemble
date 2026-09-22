/**
 * How a repo's sync gets triggered in the real world. `github-webhook` is
 * verified via `webhookSecretEnvVar` and only fires on a push to `ref`
 * (see triggers.ts); `manual` never fires on its own — it exists so a repo
 * with no webhook source can still be synced (on a schedule you drive
 * yourself, or purely by hand). Every repo, regardless of this setting, can
 * also always be synced via `POST /sync/<id>` or the `/` UI — that's a
 * separate, always-on testing/ops escape hatch, not a third trigger kind.
 */
export type TriggerKind = "github-webhook" | "manual";
const TRIGGER_KINDS: readonly TriggerKind[] = ["github-webhook", "manual"];

/** One repo this instance keeps synced: a subpath of `repo`@`ref`, published under `<destRoot>/<id>`. */
export interface RepoTarget {
  readonly id: string;
  readonly repo: string;
  readonly ref: string;
  readonly path: string;
  readonly trigger: TriggerKind;
}

const REPO_SLUG = /^[^/\s]+\/[^/\s]+$/;

/** Parses the `REPOS` env var (a JSON array of repo targets) into validated `RepoTarget`s. Throws with the offending index on any malformed entry rather than starting half-configured. */
export function parseRepoTargets(json: string): RepoTarget[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("REPOS must be a JSON array of repo targets");
  }
  return parsed.map((entry, index) => parseRepoTarget(entry, index));
}

function parseRepoTarget(entry: unknown, index: number): RepoTarget {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`REPOS[${index}] must be an object`);
  }
  const { id, repo, ref, path, trigger = "github-webhook" } = entry as Record<
    string,
    unknown
  >;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`REPOS[${index}].id must be a non-empty string`);
  }
  if (typeof repo !== "string" || !REPO_SLUG.test(repo)) {
    throw new Error(`REPOS[${index}].repo must look like "owner/name"`);
  }
  if (typeof ref !== "string" || ref.length === 0) {
    throw new Error(`REPOS[${index}].ref must be a non-empty string`);
  }
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`REPOS[${index}].path must be a non-empty string`);
  }
  if (
    typeof trigger !== "string" ||
    !TRIGGER_KINDS.includes(trigger as TriggerKind)
  ) {
    throw new Error(
      `REPOS[${index}].trigger must be one of ${TRIGGER_KINDS.join(", ")}`,
    );
  }

  return { id, repo, ref, path, trigger: trigger as TriggerKind };
}

/** The env var a target's webhook secret is delivered under — matches `envSecrets` naming in `ci/website/delivery.yml`. */
export function webhookSecretEnvVar(repoId: string): string {
  return `WEBHOOK_SECRET_${repoId.toUpperCase().replace(/-/g, "_")}`;
}
