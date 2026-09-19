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
 *
 * `mounts` is a list of `{ source, path, readOnly? }` entries, each naming a
 * `storage.volume.v1` resource to attach (`source` is usually
 * `${storage.<name>.name}`, `../../../../.ensemble/kits/deploy/compose/
 * provisioners/storage-volume.ts`'s own output) and where in the container to
 * mount it. Shallow at the contract level (`type: "array"`) — same treatment
 * as `development`: the per-entry shape is a provisioner-honored convention,
 * not something validated here. Named-volume persistence is the only shape
 * evidenced so far (compose's own `class: critical` volume on `relational`,
 * generalized to a developer-declared resource); a host bind mount has no
 * portable equivalent across targets (K8s `hostPath` is node-local, ECS
 * Fargate has no `sourcePath`) so isn't modeled — the `development` block's
 * sync rules already cover the local dev-loop case this would otherwise
 * duplicate.
 */
export const containerOrchestratedV1: ResourceContract = new ResourceContract(
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
    { name: "mounts", required: false, type: "array" },
  ],
  [],
  [],
  [],
);
