import { INIT_COMMAND_ENV, type InitCommand } from "../render/artifact.ts";

/** Thrown when one of a render pass's own init commands exits non-zero — the resource is real and this command is the only way to create the state it needs; the command itself just failed (Garage rejecting a credential that isn't in its own key format, say). */
export class InitCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitCommandError";
  }
}

/**
 * Runs the init commands a render pass declared (`Artifacts.initCommands`) —
 * the provisioning that can only happen *after* the target's own apply, and
 * on the host that applied it rather than inside the container: Garage's
 * layout/bucket/key CLI is the case that forced this, and its image is
 * `scratch` (no shell), so `docker compose exec <service> /garage …` from the
 * host is the only way to drive it at all. Same `sh -c` convention `Hooks`
 * uses for `hooks.release.after`; the artifact path and deployment name reach
 * the script as env (`INIT_COMMAND_ENV`) instead of being interpolated into
 * its text, so a kit never has to quote a path into a script.
 */
export class InitRunner {
  async run(
    commands: readonly InitCommand[],
    context: { artifactPath: string; deploymentName: string },
  ): Promise<void> {
    for (const command of commands) {
      const { success, code } = await new Deno.Command("sh", {
        args: ["-c", command.run],
        env: {
          [INIT_COMMAND_ENV.artifactPath]: context.artifactPath,
          [INIT_COMMAND_ENV.deploymentName]: context.deploymentName,
        },
      }).spawn().status;
      if (!success) {
        throw new InitCommandError(
          `"${command.name}" failed (exit ${code}): ${command.run}`,
        );
      }
    }
  }
}
