import { basename } from "@std/path";

/**
 * Splits `<url>` from an optional trailing `@<ref>` (branch, tag, or SHA). A
 * lone "@" in a schemeless SSH remote (`git@github.com:org/repo.git`) is its
 * user prefix, not a ref separator — only treated as one once a second "@"
 * (or any "@" alongside a "://" scheme) shows there really is a ref suffix.
 * Shared by `KitInstaller` and `LibInstaller` — both derive their target
 * name and initial ref the same way.
 */
export function parseUrl(input: string): { url: string; ref?: string } {
  const atCount = (input.match(/@/g) ?? []).length;
  const hasScheme = input.includes("://");
  if (atCount === 0 || (atCount === 1 && !hasScheme)) return { url: input };
  const at = input.lastIndexOf("@");
  return { url: input.slice(0, at), ref: input.slice(at + 1) };
}

/** The install target's name, derived from its repo URL (e.g. "https://github.com/org/react-kit.git" → "react-kit"). */
export function nameFromUrl(url: string): string {
  return basename(url.replace(/\.git$/, ""));
}
