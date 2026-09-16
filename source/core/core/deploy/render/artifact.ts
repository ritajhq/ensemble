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

/** Every fragment a render pass produced, in the dependency order they were rendered — byte-stable output depends on that order being deterministic (G5). */
export interface Artifacts {
  readonly fragments: readonly ArtifactFragment[];
}
