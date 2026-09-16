/** The one piece of local state ens keeps (Section 9): the last-rendered artifact's content, for the intent-diff. Not a mirror of the deployed target — the provider is the source of truth for what's actually running. */
export interface RenderCachePort {
  readLast(): Promise<string | undefined>;
  writeLast(content: string): Promise<void>;
}
