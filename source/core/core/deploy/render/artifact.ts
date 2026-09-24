import type { Category } from "../workload.ts";

/**
 * One resource's rendered contribution — a compose service, a CloudFormation
 * resource, a k8s manifest. Deliberately opaque (`content: unknown`) at the
 * core level: only the kit that produced it knows its shape; assembling many
 * fragments into one target-native document (a compose.yaml, a CFN template)
 * is that kit's own job, not the core `Renderer`'s.
 */
export interface ArtifactFragment {
  readonly category: Category;
  readonly name: string;
  readonly content: unknown;
}

/**
 * A host command to run once the target's own apply has brought the rendered
 * document up — a name plus a shell script, the same shape
 * `.ensemble/config.yaml`'s `hooks.release.after` uses, for the same reason:
 * the steps are conditional on state only the running target knows (Garage's
 * own node id, whether a bucket already exists), which no argv array can
 * carry. Spawned as `sh -c <run>`, expected to be idempotent — `ens develop`
 * re-applies against an already-running stack.
 */
export interface InitCommand {
  readonly name: string;
  readonly run: string;
}

/**
 * What the core exposes to every `InitCommand` script's environment: where
 * the artifact it just applied was written, and the deployment name that
 * artifact is scoped by. Together these are what a script needs to talk back
 * to the applied target (`docker compose -f "$ENS_ARTIFACT_PATH" -p
 * "$ENS_DEPLOYMENT_NAME" exec …`) without the core interpolating anything
 * into the script text itself — the same convention `hooks.release.after`
 * already uses for `$ENSEMBLE_RELEASE_TAG`.
 */
export const INIT_COMMAND_ENV = {
  artifactPath: "ENS_ARTIFACT_PATH",
  deploymentName: "ENS_DEPLOYMENT_NAME",
} as const;

/** Every fragment a render pass produced, in the dependency order they were rendered — byte-stable output depends on that order being deterministic (G5) — plus every init command those fragments' own provisioners declared (`ProvisionOutcome.initCommands`), flattened in that same order: the provisioning that can only run *after* the target's apply, which is why it rides alongside the fragments rather than inside any one fragment's content. */
export interface Artifacts {
  readonly fragments: readonly ArtifactFragment[];
  readonly initCommands?: readonly InitCommand[];
}
