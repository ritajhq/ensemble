import { Delegate, type Emitter } from "@duesabati/evento";
import * as Platform from "@ensemble/platform";
import type * as Kv from "./kv.ts";

/**
 * Keeps each project's branches previewed: a branch pushed is previewed —
 * up to its new tip — for every manifest whose settings track it; a branch
 * deleted has each of its previews taken down. Each change is queued as a
 * run, and announced for whoever carries runs out.
 */
export class Previews {
  private readonly requested = new Delegate<[Platform.Run]>();

  constructor(
    private readonly settings: Kv.PreviewSettings,
    private readonly live: Kv.LivePreviews,
    private readonly runs: Kv.Runs,
  ) {}

  /** A preview change was queued; it hasn't started. */
  get OnRunRequested(): Emitter<[Platform.Run]> {
    return this.requested;
  }

  /** `branch` has a new tip: preview it wherever it's tracked. None queued: nothing tracks it. */
  async pushed(project: string, branch: string): Promise<Platform.Run[]> {
    const tracking = (await this.settings.of(project)).filter((settings) =>
      settings.tracks(branch)
    );
    return await Promise.all(
      tracking.map((settings) =>
        this.queue(
          Platform.PreviewChange.create({
            project,
            manifest: settings.manifest,
            branch,
            intent: "deploy",
            kit: settings.kit,
          }),
        )
      ),
    );
  }

  /** `branch` is gone: take each of its previews down, with the kit each came up with. */
  async deleted(project: string, branch: string): Promise<Platform.Run[]> {
    const previewed = (await this.live.of(project)).filter((preview) =>
      preview.branch === branch
    );
    return await Promise.all(
      previewed.map((preview) =>
        this.queue(
          Platform.PreviewChange.create({
            project,
            manifest: preview.manifest,
            branch,
            intent: "destroy",
            kit: preview.kit,
          }),
        )
      ),
    );
  }

  private async queue(change: Platform.PreviewChange): Promise<Platform.Run> {
    const run = Platform.Run.queue(change);
    await this.runs.save(run);
    this.requested.Invoke(run);
    return run;
  }
}
