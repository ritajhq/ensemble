import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { Kit } from "../kit/kit.ts";
import type { ArtifactSink } from "./artifact-sink.ts";
import type { RenderCachePort } from "./render-cache.ts";
import { InitRunner } from "./init-runner.ts";

export class ApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyError";
  }
}

/**
 * `apply` (Section 9): render, write the artifact, then hand it to the
 * target's own native apply (`docker compose up`, `aws cloudformation
 * deploy`, `kubectl apply`) via `Kit.applyCommand` — "the dumbest step; all
 * intelligence lived in render." The only termination with real side effects
 * (G6): this is where `Deno.Command` actually runs. Runs the render pass's own
 * init commands once the apply has succeeded (the provisioning no target's
 * declarative apply can express — see `InitRunner`), then updates the render
 * cache, same as `Planner`, so a later `plan` diffs against what's really
 * running now — a failed init command leaves the cache untouched, since the
 * deployment it describes isn't actually up.
 */
export class Applier {
  constructor(
    private readonly sink: ArtifactSink,
    private readonly cache: RenderCachePort,
    private readonly initRunner: InitRunner = new InitRunner(),
  ) {}

  async apply(
    artifacts: Artifacts,
    graph: DependencyGraph,
    kit: Kit,
    name: string,
  ): Promise<void> {
    const presented = await kit.present(artifacts, graph);
    await this.sink.write(presented);

    const artifactPath = this.sink.pathFor(presented);
    const [command, ...args] = await kit.applyCommand(artifactPath, name);
    const { success, code } = await new Deno.Command(command, { args }).spawn()
      .status;
    if (!success) {
      throw new ApplyError(
        `Apply command "${
          [command, ...args].join(" ")
        }" failed with code ${code}.`,
      );
    }

    await this.initRunner.run(artifacts.initCommands ?? [], {
      artifactPath,
      deploymentName: name,
    });

    await this.cache.writeLast(presented.content);
  }
}
