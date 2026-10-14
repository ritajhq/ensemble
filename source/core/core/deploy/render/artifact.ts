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

/**
 * Somewhere the host can open into the deployment once it's up — a URL plus
 * the paths served under it, labelled by the service they reach. Only a kit
 * knows what its target publishes on the host (which port, whether over
 * TLS), so a provisioner declares these alongside its fragment rather than
 * the core deriving them from params; `ens develop` lists them once the
 * stack is up, in place of the target's own output.
 */
export interface Entrypoint {
  readonly service: string;
  readonly url: string;
  readonly paths: readonly string[];
}

/**
 * Where a router sharing one of the deployment's ingress networks reaches
 * it, and which hosts it answers for there — what an `Entrypoint` is to the
 * host, this is to whatever fronts the deployment from a shared network.
 * Only a kit knows how its target joins a network and under which name, so
 * a provisioner declares these alongside its fragment.
 *
 * `alias` is absent when the kit addresses it by the deployment's own name,
 * which only exists at apply time (a compose project name): whoever records
 * the deployment fills it in. A `hosts` entry of `""` is a catch-all route.
 */
export interface Ingress {
  readonly service: string;
  readonly networks: readonly string[];
  readonly alias?: string;
  readonly scheme: "http" | "https";
  readonly port: number;
  readonly hosts: readonly string[];
}

/** Every fragment a render pass produced, in the dependency order they were rendered — byte-stable output depends on that order being deterministic (G5) — plus every init command those fragments' own provisioners declared (`ProvisionOutcome.initCommands`), flattened in that same order: the provisioning that can only run *after* the target's apply, which is why it rides alongside the fragments rather than inside any one fragment's content. `entrypoints` and `ingresses` are flattened the same way (`ProvisionOutcome.entrypoints`, `ProvisionOutcome.ingresses`). */
export interface Artifacts {
  readonly fragments: readonly ArtifactFragment[];
  readonly initCommands?: readonly InitCommand[];
  readonly entrypoints?: readonly Entrypoint[];
  readonly ingresses?: readonly Ingress[];
}
