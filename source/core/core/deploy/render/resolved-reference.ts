/**
 * What a reference resolves to (Section 8): a **static** output bakes its
 * concrete value straight into the artifact; a **dynamic** one is never
 * learned by ens at all — it's emitted as the target's own native wiring
 * (a compose interpolation string, a k8s `secretKeyRef`, a CloudFormation
 * `!GetAtt`) for the target itself to fill in at deploy time (G3).
 */
export type ResolvedReference =
  | { readonly mode: "baked"; readonly value: unknown }
  | { readonly mode: "deferred"; readonly wiring: unknown };
