import { ResourceContract } from "../contract.ts";

/**
 * `key-value.v1` — a key-value table: items addressed by a partition key and,
 * optionally, a sort key within each partition. `keySchema` names those two
 * key attributes in store-agnostic terms (`{ partition, sort? }` — the same
 * concepts DynamoDB, Cassandra, Bigtable and Cosmos DB all build on); its
 * per-entry shape is validated by `parseKeySchema` (`../../key-schema.ts`),
 * shared by every kit, rather than here — the contract layer only checks
 * that it's a mapping, same as `container-orchestrated.v1`'s `development`.
 * A store's own specifics (attribute types, capacity mode) are the kit's
 * realization, never the manifest's.
 *
 * `name` is the table's name, which every kit realizes as the resource's own
 * name — static, known at render time, so a consumer can be configured with
 * it without waiting on the target, and what a `function.v1`'s `tables`
 * grants access to. A provider's own identity for the table (an ARN, a
 * database id) stays the kit's: nothing portable needs it.
 *
 * `engine` is the technology that holds the table — `dynamodb`, `d1` — and
 * is the developer's to pin or to leave to the kit: written, it's a
 * deliberate choice of that tech, honored only by a kit that provides it
 * (refused at resolution otherwise); left out, the kit's own default, which
 * a platform may change in its kit config. Either way it comes back as an
 * output, with the key schema's two attribute names as `partition` and
 * `sort` (empty without one) — what a resource description (`../../grants.ts`)
 * hands the code, so it needn't repeat what the manifest already says.
 */
export const keyValueV1: ResourceContract = new ResourceContract(
  "databases",
  "key-value",
  "v1",
  [
    { name: "keySchema", required: true, type: "object" },
    { name: "engine", required: false, type: "string" },
  ],
  ["engine"],
  [],
  ["name", "engine", "partition", "sort"],
);
