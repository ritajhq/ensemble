import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { PresentedArtifact } from "../render/presented-artifact.ts";
import type { ArtifactSink } from "./artifact-sink.ts";

/** Writes a presented artifact to a file under one directory — the adapter behind `ArtifactSink` for both `eject` (the outputs dir) and `apply` (wherever the target's native apply command needs a real file). */
export class FileArtifactSink implements ArtifactSink {
  constructor(private readonly directory: string) {}

  async write(artifact: PresentedArtifact): Promise<void> {
    await ensureDir(this.directory);
    await Deno.writeTextFile(this.pathFor(artifact), artifact.content);
  }

  pathFor(artifact: PresentedArtifact): string {
    return join(this.directory, artifact.filename);
  }
}
