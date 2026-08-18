import type { GitAuthStrategy } from "./git-repositories.ts";

/**
 * Commits a file directly to a git host, no local clone — used by the
 * dashboard's secrets editor (see secrets.yml's per-context storage) to push
 * a change without the heavier clone/sparse-checkout machinery
 * git-integration.ts already uses for reading a repo's workflows/ folder.
 * Kept behind this interface (rather than calling GitHub's API directly from
 * the secrets handler) so a future non-GitHub host is a new implementation
 * of this same shape, not a rearchitecture of the secrets-commit path.
 */
export interface GitWriteProvider {
  /** Reads one file's current raw content, or undefined if it doesn't exist yet at that path. */
  getFile(
    repoUrl: string,
    auth: GitAuthStrategy,
    path: string,
  ): Promise<Uint8Array | undefined>;
  /** Creates or updates one file at `path`, committing directly. Returns the new commit's identifier. */
  putFile(
    repoUrl: string,
    auth: GitAuthStrategy,
    path: string,
    content: Uint8Array,
    message: string,
    author: { name: string; email: string },
  ): Promise<{ commitSha: string }>;
  /** Deletes one file at `path`, committing directly. No-ops (returns undefined) if the file doesn't exist. */
  deleteFile(
    repoUrl: string,
    auth: GitAuthStrategy,
    path: string,
    message: string,
    author: { name: string; email: string },
  ): Promise<{ commitSha: string } | undefined>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Extracts "owner/repo" from a GitHub URL (https://github.com/owner/repo(.git)? or git@github.com:owner/repo(.git)?). */
function parseGithubOwnerRepo(
  repoUrl: string,
): { owner: string; repo: string } {
  const trimmed = repoUrl.trim().replace(/\.git$/, "");
  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/,
  );
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  const match = httpsMatch ?? sshMatch;
  if (!match) {
    throw new Error(`"${repoUrl}" doesn't look like a GitHub repository URL.`);
  }
  return { owner: match[1], repo: match[2] };
}

function authHeaders(auth: GitAuthStrategy): Record<string, string> {
  if (auth.type !== "pat") {
    throw new Error(
      "Committing via the GitHub Contents API requires a repository registered with a PAT (write-scoped).",
    );
  }
  return {
    authorization: `Bearer ${auth.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
}

/**
 * Commits via GitHub's Contents API (one authenticated REST call per read/
 * write, no local clone). The stored PAT (see GitAuthStrategy) must carry
 * write access to the repository — a push with a read-only token fails with
 * a clear 403/404 from GitHub itself, surfaced as this function's thrown
 * error; not checked ahead of time.
 */
export function createGithubContentsProvider(): GitWriteProvider {
  return {
    async getFile(repoUrl, auth, path) {
      const { owner, repo } = parseGithubOwnerRepo(repoUrl);
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers: authHeaders(auth) },
      );
      if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
      }
      if (!response.ok) {
        throw new Error(
          `GitHub Contents API GET ${path} failed: ${response.status} ${await response
            .text()}`,
        );
      }
      const body = await response.json();
      return fromBase64(body.content.replaceAll("\n", ""));
    },

    async putFile(repoUrl, auth, path, content, message, author) {
      const { owner, repo } = parseGithubOwnerRepo(repoUrl);
      const url =
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      // The Contents API requires the current file's blob sha to update an
      // existing file (omit it only when creating a brand new one) — one
      // extra GET, unavoidable with this API shape.
      const existing = await fetch(url, { headers: authHeaders(auth) });
      let sha: string | undefined;
      if (existing.status === 200) {
        sha = (await existing.json()).sha;
      } else if (existing.status !== 404) {
        throw new Error(
          `GitHub Contents API GET ${path} failed: ${existing.status} ${await existing
            .text()}`,
        );
      } else {
        await existing.body?.cancel();
      }

      const response = await fetch(url, {
        method: "PUT",
        headers: { ...authHeaders(auth), "content-type": "application/json" },
        body: JSON.stringify({
          message,
          content: toBase64(content),
          sha,
          committer: author,
          author,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `GitHub Contents API PUT ${path} failed: ${response.status} ${await response
            .text()}`,
        );
      }
      const body = await response.json();
      return { commitSha: body.commit.sha };
    },

    async deleteFile(repoUrl, auth, path, message, author) {
      const { owner, repo } = parseGithubOwnerRepo(repoUrl);
      const url =
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      // DELETE also requires the current blob sha — same GET-then-mutate
      // dance putFile already does.
      const existing = await fetch(url, { headers: authHeaders(auth) });
      if (existing.status === 404) {
        await existing.body?.cancel();
        return undefined;
      }
      if (!existing.ok) {
        throw new Error(
          `GitHub Contents API GET ${path} failed: ${existing.status} ${await existing
            .text()}`,
        );
      }
      const sha = (await existing.json()).sha;

      const response = await fetch(url, {
        method: "DELETE",
        headers: { ...authHeaders(auth), "content-type": "application/json" },
        body: JSON.stringify({ message, sha, committer: author, author }),
      });
      if (!response.ok) {
        throw new Error(
          `GitHub Contents API DELETE ${path} failed: ${response.status} ${await response
            .text()}`,
        );
      }
      const body = await response.json();
      return { commitSha: body.commit.sha };
    },
  };
}
