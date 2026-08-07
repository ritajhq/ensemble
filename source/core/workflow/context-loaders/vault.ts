import type { ContextLoader, LoadedValue } from "./types.ts";

/**
 * Server-side loader backed by Deno KV + on-disk files, populated by a
 * dashboard UI for variables/secrets uploaded per workflow (mirroring
 * git-repositories.ts's KV conventions). Not implemented yet — always
 * reports unavailable, so the default local-then-vault loader order
 * degrades gracefully to "local only" until a later phase fills this in.
 */
export function createVaultLoader(): ContextLoader {
  return {
    name: "vault",
    isAvailable(_contextName: string): Promise<boolean> {
      return Promise.resolve(false);
    },
    loadVariable(_contextName: string, _key: string): Promise<LoadedValue | undefined> {
      return Promise.resolve(undefined);
    },
    loadSecret(_contextName: string, _key: string): Promise<LoadedValue | undefined> {
      return Promise.resolve(undefined);
    },
  };
}
