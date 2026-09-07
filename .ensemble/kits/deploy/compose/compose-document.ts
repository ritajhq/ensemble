export interface ComposeWatchRule {
  path: string;
  action: "sync" | "sync+restart";
  target: string;
}

/** The subset of Compose's schema this kit actually emits. */
export interface ComposeService {
  image: string;
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  command?: string[];
  restart?: string;
  depends_on?: string[];
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
  };
  secrets?: string[];
  develop?: {
    watch: ComposeWatchRule[];
  };
  /** Networks this service joins, beyond the workload's own implicit default network — see ComposeDocument.networks. */
  networks?: string[];
}

/** A Compose secret sourced either from a local file (`file`) or from an env var of the compose process (`environment`) — exactly one is set. See Compose's secrets docs. */
export interface ComposeSecret {
  file?: string;
  environment?: string;
}

/**
 * An `external: true` network is one this workload doesn't create/manage —
 * declared elsewhere (another stack's `docker network create`, or its own
 * `docker compose up`) — see external.ts's Network kind. `name` pins a
 * Compose-managed (non-external) network to a literal name instead of
 * Compose's own project-prefixed default — used in development mode so an
 * `external` entry's declared name still means something concrete locally,
 * while Compose auto-creates it if missing rather than requiring it to
 * already exist.
 */
export interface ComposeNetwork {
  external?: true;
  name?: string;
}

export interface ComposeDocument {
  name: string;
  services: Record<string, ComposeService>;
  volumes: Record<string, Record<string, never>>;
  secrets: Record<string, ComposeSecret>;
  networks: Record<string, ComposeNetwork>;
}

export function newComposeDocument(name: string): ComposeDocument {
  return { name, services: {}, volumes: {}, secrets: {}, networks: {} };
}
