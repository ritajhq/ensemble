/** The files in `../../icons/`, by name without extension — what a renderer looks an entry's `icon` up by. */
export type Icon =
  | "compute-container"
  | "compute-function"
  | "database-key-value"
  | "database-relational"
  | "external"
  | "gateway"
  | "network"
  | "release"
  | "secret"
  | "storage-object"
  | "storage-volume"
  | "task"
  | "unknown"
  | "variable";

/** Which icon stands for a resource of some `type`; a type this doesn't know falls back to `unknown`. */
export class Icons {
  private static readonly BY_TYPE: Readonly<Record<string, Icon>> = {
    "container-orchestrated": "compute-container",
    "function": "compute-function",
    "key-value": "database-key-value",
    "relational": "database-relational",
    "gateway": "gateway",
    "object-storage": "storage-object",
    "volume": "storage-volume",
  };

  forResource(type: string): Icon {
    return Icons.BY_TYPE[type] ?? "unknown";
  }
}
