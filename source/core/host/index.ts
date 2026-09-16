import type { Ports } from "@ensemble/core";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { NativeProcessRunner } from "./process-runner.ts";

export { findRepoRoot } from "./repo.ts";
export { resolveDenoExecutable } from "./deno-exe.ts";
export { NativeProcessRunner } from "./process-runner.ts";
export {
  type Spawned,
  terminateChildrenOnSignal,
} from "./terminate-children-on-signal.ts";
export { AnimatedBuildReporter } from "./animated-build-reporter.ts";
export { AnimatedPackReporter } from "./animated-pack-reporter.ts";
export { SubprocessPackKitGateway } from "./pack-kit-gateway.ts";
export { GitPackageSource } from "./git-package-source.ts";

/**
 * Bundles the concrete, machine-facing adapters core's orchestration needs
 * (`@ensemble/core`'s `Ports`) — the composition root (the CLI app) calls
 * this once per invocation and threads the result into every `runX`
 * call/class construction, so core itself never touches `@david/dax`,
 * repo-root discovery, or deno-executable resolution directly.
 */
export function createPorts(): Ports {
  return {
    repo: { findRepoRoot },
    denoExe: { resolveDenoExecutable },
    process: new NativeProcessRunner(),
  };
}
