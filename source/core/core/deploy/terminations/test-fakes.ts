import type { DependencyGraph } from "../resolve/dependency-graph.ts";
import type { Artifacts } from "../render/artifact.ts";
import type { PresentedArtifact } from "../render/presented-artifact.ts";
import type { Kit } from "../kit/kit.ts";
import type { ProvisionerSet } from "../kit/provisioner.ts";
import type { Realization } from "../kit/realization.ts";
import type { ArtifactSink } from "./artifact-sink.ts";
import type { RenderCachePort } from "./render-cache.ts";

/** Test-only fakes for Phase 6's terminations — not part of the public barrel. */

export class FakePresentingKit implements Kit {
  constructor(
    private readonly presented: PresentedArtifact,
    private readonly command: readonly string[] = ["true"],
    private readonly watch: readonly string[] | undefined = undefined,
  ) {}
  provisioners(): ProvisionerSet {
    return [];
  }
  realization(): Realization {
    throw new Error("not needed by these tests");
  }
  present(): PresentedArtifact {
    return this.presented;
  }
  applyCommand(artifactPath: string): readonly string[] {
    return [...this.command, artifactPath];
  }
  watchCommand(artifactPath: string): readonly string[] | undefined {
    return this.watch ? [...this.watch, artifactPath] : undefined;
  }
}

export class FakeArtifactSink implements ArtifactSink {
  readonly written: PresentedArtifact[] = [];
  constructor(private readonly resolvedPath = "/fake/path") {}
  write(artifact: PresentedArtifact): Promise<void> {
    this.written.push(artifact);
    return Promise.resolve();
  }
  pathFor(): string {
    return this.resolvedPath;
  }
}

export class FakeRenderCache implements RenderCachePort {
  constructor(private last: string | undefined = undefined) {}
  readLast(): Promise<string | undefined> {
    return Promise.resolve(this.last);
  }
  writeLast(content: string): Promise<void> {
    this.last = content;
    return Promise.resolve();
  }
}

export const EMPTY_ARTIFACTS: Artifacts = { fragments: [] };
export const EMPTY_GRAPH = {
  batches: () => [],
  dependenciesOf: () => [],
} as unknown as DependencyGraph;
