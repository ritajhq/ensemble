import type { BatchEntry } from "./graph.ts";
import type { Workload } from "./workload.ts";

/**
 * Options every deploy run carries, regardless of target. `watch` — a
 * `Kit`'s `up` procedure decides for itself what watch mode means for its
 * own target (bind-mounting artifact paths, polling, etc.), the SDK doesn't
 * impose a mechanism. `version` is which released version to resolve every
 * `${release.<name>.image}` reference to (`"latest"` meaning whatever's
 * packed locally) — meaningless for `down`, which tears down whatever's
 * running regardless of version. `development` is whether `external`
 * entries should be treated as genuinely external (looked up, must already
 * exist — the real `external.ts` semantics, for a real deploy) or as
 * auto-creatable local conveniences (for `ens develop`, where nothing else
 * actually owns them) — a kit decides for itself what that distinction
 * means for its own target.
 */
export interface KitRunOptions {
  watch: boolean;
  version: string;
  development: boolean;
}

/**
 * Passed to every `up`/`down` call alongside the run's own inputs — the
 * place a kit deposits whatever files/state it needs across or within a run
 * (a rendered compose.yaml, a Terraform state file, generated manifests).
 * `volumePath` is resolved once by `ens` from `ENSEMBLE_DEPLOY_VOLUME` (with
 * a default fallback) and handed here as a plain directory a kit owns the
 * contents of — the SDK imposes no structure on what's written there.
 * `artifactsPath` is the workspace's `artifacts/` folder — the same one
 * `ens build`/`ens pack` already write into — so a kit implementing
 * `compute.development.sync` (see compute.ts) can resolve a `sync[].app`
 * name to that app's actual build output directory on disk.
 */
export interface KitContext {
  volumePath: string;
  artifactsPath: string;
}

/**
 * A kit's `up`/`down` procedure. Receives the whole resolved `Workload` (not
 * narrowed per-entry — see the taxonomy doc's "kit owns linking" decision:
 * only the kit itself knows how its target's real shape needs every entry
 * assembled together, e.g. one compose.yaml with correct `depends_on`, not N
 * independent per-entry files) plus `batches` (the dependency-ordered
 * resolution groups `buildBatches` already computed, so the kit doesn't have
 * to re-derive resolution order itself — just walk it).
 */
export type KitProcedure = (
  workload: Workload,
  batches: BatchEntry[][],
  options: KitRunOptions,
  ctx: KitContext,
) => Promise<void> | void;

/**
 * The deploy kit contract: instantiate one per kit (e.g. in a kit's
 * `main.ts`), then `Configure` it once with the kit's `up`/`down`
 * procedures. Constructed with no arguments today — reserved configuration
 * space for later, not yet needed.
 */
export class Kit {
  private up?: KitProcedure;
  private down?: KitProcedure;

  /** Registers this kit's `up`/`down` procedures. Call once — a second call is a bug in the kit, not a valid override. */
  Configure(up: KitProcedure, down: KitProcedure): void {
    if (this.up || this.down) {
      throw new Error(
        "This Kit has already been configured — Configure must be called exactly once.",
      );
    }
    this.up = up;
    this.down = down;
  }

  /** Runs this kit's `up` procedure. `options.watch` distinguishes a plain bring-up from a watch-mode run — there's no separate `watch` procedure; a kit's own `up` decides what watch mode does for its target. Throws if Configure hasn't been called yet. */
  async Up(
    workload: Workload,
    batches: BatchEntry[][],
    options: KitRunOptions,
    ctx: KitContext,
  ): Promise<void> {
    if (!this.up) {
      throw new Error(
        "This Kit hasn't been configured yet — call Configure before Up.",
      );
    }
    await this.up(workload, batches, options, ctx);
  }

  /** Runs this kit's `down` procedure. Throws if Configure hasn't been called yet. */
  async Down(
    workload: Workload,
    batches: BatchEntry[][],
    options: KitRunOptions,
    ctx: KitContext,
  ): Promise<void> {
    if (!this.down) {
      throw new Error(
        "This Kit hasn't been configured yet — call Configure before Down.",
      );
    }
    await this.down(workload, batches, options, ctx);
  }
}
