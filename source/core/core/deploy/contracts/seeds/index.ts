import type { ResourceContract } from "../contract.ts";
import { containerV1 } from "./container.ts";
import { functionV1 } from "./function.ts";
import { gatewayV1 } from "./gateway.ts";
import { keyValueV1 } from "./key-value.ts";
import { objectStorageV1 } from "./object-storage.ts";
import { relationalV1 } from "./relational.ts";
import { storageVolumeV1 } from "./storage-volume.ts";

/** Every contract core seeds — what a `Catalog` is built from wherever a manifest is read (deploying it, or editing it). */
export const SEEDED: readonly ResourceContract[] = [
  relationalV1,
  containerV1,
  storageVolumeV1,
  gatewayV1,
  objectStorageV1,
  keyValueV1,
  functionV1,
];
