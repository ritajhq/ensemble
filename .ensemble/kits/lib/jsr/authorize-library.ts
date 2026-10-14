import type * as KitSdk from "@ensemble/kit-sdk";

/** The slice of `fetch` the membership check needs — its own seam so a test can answer for the JSR API instead of reaching it. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Whether the account behind a JSR token may publish into a scope: JSR lets
 * any member of a scope publish its packages, so membership is the question.
 * Asked through `GET /user/member/{scope}`, which only answers for the
 * token's own account — read-only, nothing is created or reserved.
 */
export class ScopeMembership {
  constructor(
    private readonly token: string,
    private readonly fetch: Fetch = globalThis.fetch,
    private readonly apiUrl = "https://api.jsr.io",
  ) {}

  /** Resolves when the token's account is a member of `scope`; throws with the reason otherwise. */
  async require(scope: string): Promise<void> {
    const response = await this.fetch(`${this.apiUrl}/user/member/${scope}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (response.ok) return;

    const detail = await response.text().catch(() => "");
    const reasons: Record<number, string> = {
      401: "JSR rejected JSR_TOKEN — it's invalid or expired.",
      403:
        "JSR_TOKEN isn't allowed to read its own scope memberships, so publishing can't be verified up front — use a token with full API access.",
      404: `the account behind JSR_TOKEN isn't a member of scope @${scope}.`,
    };
    throw new Error(
      reasons[response.status] ??
        `JSR answered HTTP ${response.status} checking membership of @${scope}${
          detail ? `: ${detail}` : ""
        }.`,
    );
  }
}

/**
 * The `jsr` lib kit's authorize step. Requires `JSR_TOKEN`: without it
 * `deno publish` falls back to interactive browser auth, which can't be
 * verified before the release has already changed things.
 */
export async function authorizeLibrary(
  context: KitSdk.Lib.Context,
  membershipFor: (token: string) => ScopeMembership = (token) =>
    new ScopeMembership(token),
): Promise<void> {
  const token = Deno.env.get("JSR_TOKEN");
  if (!token) {
    throw new Error(
      "JSR_TOKEN isn't set — releases need a token so publishing can be verified before anything changes.",
    );
  }
  const scope = /^@([^/]+)\//.exec(context.package)?.[1];
  if (!scope) {
    throw new Error(
      `"${context.package}" isn't a scoped JSR package name (expected @scope/name).`,
    );
  }
  await membershipFor(token).require(scope);
}
