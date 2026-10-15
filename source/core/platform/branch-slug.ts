import { Fingerprint } from "./fingerprint.ts";

/**
 * A branch name as a short DNS label: what its previews are named after, in
 * their instance and in the hosts they answer on. A name that survives
 * cleaning unchanged and short enough is kept as it is (`main`); any other
 * (`feat/Login`) gets a fingerprint of the original appended, so
 * `feat/login` and `feat-login` — which clean to the same words — never land
 * on one preview and overwrite each other's.
 */
export class BranchSlug {
  /** Short, because a preview's public host spells it beside a subdomain and the project: one label, 63 characters at most. */
  static readonly MAX_LENGTH = 20;

  private constructor(readonly value: string) {}

  static of(branch: string): BranchSlug {
    const cleaned = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
      /^-+|-+$/g,
      "",
    );
    if (cleaned === branch && cleaned.length <= BranchSlug.MAX_LENGTH) {
      return new BranchSlug(cleaned);
    }
    const stem = cleaned
      .slice(0, BranchSlug.MAX_LENGTH - Fingerprint.LENGTH - 1)
      .replace(/-+$/, "");
    const fingerprint = Fingerprint.of(branch);
    return new BranchSlug(stem ? `${stem}-${fingerprint}` : fingerprint);
  }
}
