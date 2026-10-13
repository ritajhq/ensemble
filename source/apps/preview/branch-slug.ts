/**
 * A branch name as the DNS label its preview answers on, and as the instance
 * slug `ens deploy --instance` takes. Lowercase letters, digits and hyphens.
 *
 * A name that survives cleaning unchanged is kept as it is (`main`); one that
 * doesn't (`feat/Login`) gets a short digest of the original appended, so
 * `feat/login` and `feat-login` — which clean to the same words — never land
 * on one preview and overwrite each other's.
 */
export class BranchSlug {
  /** The longest an instance slug may be (`Instance` in `@ensemble/core`). */
  private static readonly MAX_LENGTH = 50;
  private static readonly DIGEST_LENGTH = 8;

  private constructor(readonly value: string) {}

  static of(branch: string): BranchSlug {
    const cleaned = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
      /^-+|-+$/g,
      "",
    );
    if (cleaned === branch && cleaned.length <= BranchSlug.MAX_LENGTH) {
      return new BranchSlug(cleaned);
    }

    const digest = BranchSlug.digest(branch);
    const stem = cleaned
      .slice(0, BranchSlug.MAX_LENGTH - BranchSlug.DIGEST_LENGTH - 1)
      .replace(/-+$/, "");
    return new BranchSlug(stem ? `${stem}-${digest}` : digest);
  }

  /** FNV-1a, 32 bits: a stable short fingerprint, not a security boundary. */
  private static digest(text: string): string {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(text)) {
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(BranchSlug.DIGEST_LENGTH, "0");
  }
}
