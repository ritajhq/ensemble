/** `git@host:owner/repo.git`, which has no scheme for a `URL` to parse. */
const SCP_LIKE = /^(?:[^@/]+@)?([^/:]+):(?!\/)(.+)$/;
const NETWORK_SCHEMES = new Set(["http:", "https:", "ssh:", "git:"]);
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

/** A repository's host and owner, when `remote` names them recognisably. */
function hostAndOwner(
  remote: string,
): { host: string; owner: string } | undefined {
  const parsed = URL.canParse(remote) ? new URL(remote) : undefined;
  const scpLike = parsed && NETWORK_SCHEMES.has(parsed.protocol)
    ? undefined
    : remote.match(SCP_LIKE);
  if (parsed && !scpLike && !NETWORK_SCHEMES.has(parsed.protocol)) {
    return undefined;
  }
  const host = scpLike?.[1] ?? parsed?.hostname;
  const path = scpLike?.[2] ?? parsed?.pathname;
  if (!host || !path) return undefined;
  if (!host.includes(".") || IPV4.test(host)) return undefined;
  const [owner, repository] = path.split("/").filter(Boolean);
  return owner && repository ? { host, owner } : undefined;
}

/** One dot-free part of an identifier: what Tauri takes (letters, digits, hyphens), and nothing at either end. */
function segment(text: string): string {
  return text.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * A Tauri app's bundle identifier, which nobody should have to invent: the
 * reverse of where the project's `origin` lives and who owns it
 * (`com.github.ritajhq.<crate>`), or, with no such remote to go by,
 * `local.<project>.<crate>`, which stays the same for as long as the project's
 * name does.
 */
export class BundleIdentifier {
  private constructor(private readonly segments: readonly string[]) {}

  static for(
    remote: string | undefined,
    project: string,
    crate: string,
  ): BundleIdentifier {
    const origin = remote === undefined ? undefined : hostAndOwner(remote);
    const namespace = origin
      ? [...origin.host.split(".").reverse(), origin.owner]
      : ["local", project];
    return new BundleIdentifier([...namespace, crate]);
  }

  toString(): string {
    return this.segments.map(segment).filter(Boolean).join(".");
  }
}
