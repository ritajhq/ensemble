import type { Preview } from "./configuration.ts";
import { Process } from "./process.ts";

/**
 * The `ens` CLI, run against a preview's checkout. The deployment's own
 * values reach it through the environment, as they do in any pipeline:
 * this process's, plus what the preview itself determines (its hostname,
 * its gateway alias).
 */
export class Ensemble {
  constructor(private readonly binary: string) {}

  async deploy(preview: Preview, checkout: string): Promise<void> {
    const { repository } = preview;
    await new Process(
      this.binary,
      [
        "deploy",
        repository.delivery,
        repository.kit,
        "--instance",
        preview.slug,
        "--artifacts",
        "local",
        ...repository.envFiles.flatMap((file) => ["--env-file", file]),
      ],
      { cwd: checkout, env: preview.environment },
    ).run();
  }

  async destroy(preview: Preview, checkout: string): Promise<void> {
    const { repository } = preview;
    await new Process(
      this.binary,
      [
        "destroy",
        repository.delivery,
        repository.kit,
        "--instance",
        preview.slug,
      ],
      { cwd: checkout, env: preview.environment },
    ).run();
  }
}
