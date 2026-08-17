/** What a loader found for one declared variable/secret name — a scalar, a file already on disk, or both. */
export interface LoadedValue {
  scalar?: string;
  /** Absolute path to a file already on disk holding this value's content. */
  filePath?: string;
}

/**
 * Supplies values for a workflow's declared `context.variables`/`context.secrets`
 * entries that have no inline `value`. Loaders are tried in sequence (see
 * context-loaders/resolve.ts) until one reports a value for a given name —
 * `isAvailable` lets the engine skip a loader that has nothing at all for the
 * requested context name, distinct from "this loader has the context, but not
 * this particular key" (which loadVariable/loadSecret signal by resolving to
 * undefined).
 */
export interface ContextLoader {
  readonly name: "local";
  isAvailable(contextName: string): Promise<boolean>;
  loadVariable(
    contextName: string,
    key: string,
  ): Promise<LoadedValue | undefined>;
  loadSecret(
    contextName: string,
    key: string,
  ): Promise<LoadedValue | undefined>;
  /** Looks up an exact filename (extension included) under this context's variables, for `contextFile("<filename>")`. Returns a real path to the file's content, verbatim — no parsing. */
  loadVariableFile(
    contextName: string,
    filename: string,
  ): Promise<string | undefined>;
  /** Same as loadVariableFile, but under this context's secrets, for `contextSecretFile("<filename>")`. */
  loadSecretFile(
    contextName: string,
    filename: string,
  ): Promise<string | undefined>;
}
