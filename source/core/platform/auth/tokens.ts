import { join } from "@std/path";
import { timingSafeEqual } from "@std/crypto/timing-safe-equal";
import { findRepoRoot } from "@ensemble/core";

export interface TokenPermissions {
  trigger?: boolean;
  upload?: boolean;
  read?: boolean;
}

type TokensFile = Record<string, TokenPermissions>;

let cache: { mtime: number; tokens: TokensFile } | undefined;

async function getTokensFilePath(): Promise<string> {
  const repoRoot = await findRepoRoot();
  return join(repoRoot, ".ensemble", "tokens.json");
}

async function loadTokens(): Promise<TokensFile> {
  const path = await getTokensFilePath();

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(path);
  } catch {
    cache = undefined;
    return {};
  }

  const mtime = stat.mtime?.getTime() ?? 0;
  if (cache && cache.mtime === mtime) return cache.tokens;

  const text = await Deno.readTextFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object mapping tokens to permission records.`);
  }

  const tokens = parsed as TokensFile;
  cache = { mtime, tokens };
  return tokens;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

/**
 * Checks a request's `Authorization: Bearer <token>` against
 * .ensemble/tokens.json, requiring the matched token's permission record to
 * have `permission` set to true. Every candidate token is compared (never
 * short-circuiting on the first match) so response timing doesn't leak which
 * stored token, if any, was closest to matching. Fails closed: a missing,
 * empty, or malformed tokens file, an unknown token, or a token lacking the
 * requested permission, all reject the request. Cached in memory and
 * re-read only when the file's mtime changes, so rotating tokens doesn't
 * need a server restart but a steady-state server isn't re-parsing JSON on
 * every request either.
 *
 * TEMPORARY: this is a deliberately small bridge until a real authorization
 * layer replaces it — see the platform README.
 */
export async function isAuthorizedFor(request: Request, permission: keyof TokenPermissions): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);

  const tokens = await loadTokens();

  let matched: TokenPermissions | undefined;
  for (const [token, permissions] of Object.entries(tokens)) {
    if (timingSafeStringEqual(token, provided)) {
      matched = permissions;
    }
  }

  return matched?.[permission] === true;
}
