/** Raised for any structural problem in a manifest: missing/unsupported `version`, an unknown envelope or category key, or a malformed resource — always a legible, single-sentence message naming the offending path. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}
