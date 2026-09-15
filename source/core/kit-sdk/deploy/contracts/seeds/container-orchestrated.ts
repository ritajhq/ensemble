import { ResourceContract } from "../contract.ts";

/**
 * `container-orchestrated.v1` — a container-based compute entry. Params mirror
 * Appendix A's worked example (`image`, `replicas`, `ports`, `env`). No
 * negotiated concerns or capabilities are evidenced by the worked example yet
 * — left empty rather than invented ahead of a concrete need. No contract
 * outputs either: nothing in Appendix A references `${compute.*}`; a
 * compute's *ports* are individually referenceable instead (`${compute.api.
 * http}`, per the acceptance checklist's "or a compute's declared port"), a
 * mechanism the `ReferenceValidator` handles by reading `ports` directly
 * rather than the contract's `outputs` list — a compute's ports are
 * developer-declared data (a param), not a provisioner-produced output.
 *
 * `development` is accepted here only at the shallow, contract level (must
 * be an object) — the compute `development` block is developer-owned,
 * dev-only data whose real shape (`../../development.ts`'s `SyncRule`
 * schema) is validated only by a provisioner that actually honors it during
 * render (the watch/develop plan); every other path leaves the raw value
 * alone rather than rejecting it upfront.
 *
 * `networks` names the (typically external) networks this container attaches
 * to — entries are usually `${external.<name>.name}` references into a
 * `deploy.external` declaration (ens provisions no network itself, only
 * threads the referenced name through to the target), though a literal
 * network name works too.
 */
export const containerOrchestratedV1 = new ResourceContract(
  "compute",
  "container-orchestrated",
  "v1",
  [
    { name: "image", required: true, type: "string" },
    { name: "replicas", required: true, type: "number" },
    { name: "ports", required: false, type: "object" },
    { name: "env", required: false, type: "object" },
    { name: "development", required: false, type: "object" },
    { name: "networks", required: false, type: "array" },
  ],
  [],
  [],
  [],
);
