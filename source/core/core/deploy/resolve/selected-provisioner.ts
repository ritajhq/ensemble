import type { Provisioner } from "../kit/provisioner.ts";

/** A capability the resource requested that this kit's realization doesn't declare support for — "undeclared support defaults to not satisfied" (Section 11's fail-safe). Non-fatal: the driver, not resolution, decides policy. */
export interface CapabilityGap {
  readonly capability: string;
  readonly requested: boolean | number;
}

/** The provisioner first-matched to a resource, plus any capability gaps found against the kit's realization. */
export interface SelectedProvisioner {
  readonly provisioner: Provisioner;
  readonly gaps: readonly CapabilityGap[];
}

/** One provisioner's match result against a resource, for `ens deploy explain` (Phase 8) — "which provisioner matched, and why others didn't." `description` falls back to a positional label when the provisioner declares no `describe()`. */
export interface ProvisionerMatchExplanation {
  readonly description: string;
  readonly matched: boolean;
}

/** Raised when no provisioner in the kit's set matches the resource at all — a hard failure distinct from a capability gap (which is a diagnostic on an otherwise-successful match). */
export class NoMatchingProvisionerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMatchingProvisionerError";
  }
}
