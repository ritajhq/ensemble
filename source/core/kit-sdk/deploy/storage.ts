import type { JsonValue } from "./json.ts";

/** Every storage kind this spec understands. Block storage is deliberately excluded — see Compute's Volume. */
export type StorageKind = "object-storage" | "file-storage";

interface StorageBase {
  /** A named provisioning tier/policy a target's translator interprets (e.g. "default", "durable"). Left to the target, not enumerated here. */
  class?: string;
  /** Raw, target-native config a kit may merge into its own translation of this one entry, keyed by target name (e.g. `overrides["aws-terraform"]`) — an escape hatch for per-resource customization a kit's defaults don't cover. Opaque to the SDK; only the named target's own kit interprets it. */
  overrides?: Record<string, JsonValue>;
}

/** Put/get/delete by key, bucket-level policy, presigned URLs (S3, GCS, Azure Blob Storage). */
export interface ObjectStorage extends StorageBase {
  type: "object-storage";
}

/** Networked filesystem, mountable by multiple compute instances at once (EFS, Filestore, Azure Files) — distinct from block storage, which has no independent identity. */
export interface FileStorage extends StorageBase {
  type: "file-storage";
}

export type Storage = ObjectStorage | FileStorage;
