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
 * `development` is accepted (but otherwise untyped/unvalidated) per Section
 * 12's reserved watch seam: "the compute `development` block stays in the
 * manifest as developer-owned, dev-only data that only the watch path reads
 * and every other path ignores" — accepted here, not rejected, even though
 * nothing reads it yet.
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
  ],
  [],
  [],
  [],
);
