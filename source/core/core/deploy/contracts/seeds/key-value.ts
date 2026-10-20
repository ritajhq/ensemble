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
 */
export const keyValueV1: ResourceContract = new ResourceContract(
  "databases",
  "key-value",
  "v1",
  [{ name: "keySchema", required: true, type: "object" }],
  [],
  [],
  ["name"],
);
