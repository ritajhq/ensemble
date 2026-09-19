import { ResourceContract } from "../contract.ts";

/**
 * `storage.volume.v1` — a persistent, named storage volume with no shape of
 * its own beyond its identity: `outputs: ["name"]` is the whole surface,
 * mirroring what compose already does implicitly for `relational`'s own
 * `class: critical` volume (`../../../../.ensemble/kits/deploy/compose/
 * provisioners/relational.ts`) — a compose named volume has no size, class,
 * or backend of its own to declare, only a name other resources reference.
 * No `params`, `negotiatedConcerns`, or `capabilities` yet, for the same
 * reason `container-orchestrated.v1` started with none of its own
 * (Section 7: "left empty rather than invented ahead of a concrete need") —
 * a `size`/negotiated-concern shape (mirroring `relational.v1`'s
 * `storageSize`) is deferred until a second target (aws EFS, say) proves
 * what it should look like; compose has nothing to render it into today.
 *
 * Exists so `container-orchestrated.v1`'s own `mounts` param has something
 * to reference (`${storage.<name>.name}`) — a mount names *what* it attaches
 * (this resource, by its output), not how that resource is provisioned.
 */
export const storageVolumeV1: ResourceContract = new ResourceContract(
  "storage",
  "volume",
  "v1",
  [],
  [],
  [],
  ["name"],
);
