import type { JsonValue } from "./json.ts";

/** The only config-input category kind this spec declares. */
export type VariableKind = "variable";

/**
 * A plain (non-sensitive) configuration input a workload depends on — the
 * counterpart to `Secret`, and shaped identically: a valueless named
 * declaration, never the value itself. Declaring it forces the manifest to
 * enumerate exactly which external variables it consumes; the value is
 * supplied at deploy time by whatever pipeline runs `ens deploy` (see the
 * compose kit's `requireVariables`), and a workload wires it into a container
 * explicitly via `${variables.<name>.value}`. Use `secrets` instead for
 * anything sensitive — a secret never lands in a container's environment.
 */
export interface Variable {
  type: "variable";
  class?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name. Opaque to the SDK — see storage.ts's StorageBase.overrides. */
  overrides?: Record<string, JsonValue>;
}
