/** Thrown when GitHub answers a call with an error: its status, and GitHub's own message. */
export class RefusedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RefusedError";
  }
}

/** How a call proves who makes it: as the app itself (its JWT), as one of its installations (a token), or as no one. */
export type Credential =
  | { readonly kind: "app"; readonly jwt: string }
  | { readonly kind: "installation"; readonly token: string }
  | { readonly kind: "none" };

/** Each credential, as the header GitHub reads it from. */
const AUTHORIZATIONS: {
  readonly [K in Credential["kind"]]: (
    credential: Extract<Credential, { kind: K }>,
  ) => Record<string, string>;
} = {
  app: ({ jwt }) => ({ authorization: `Bearer ${jwt}` }),
  installation: ({ token }) => ({ authorization: `token ${token}` }),
  none: () => ({}),
};

/** GitHub's REST API. */
export class Rest {
  constructor(
    private readonly origin = "https://api.github.com",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async call<T>(
    method: string,
    path: string,
    credential: Credential,
    body?: unknown,
  ): Promise<T> {
    const authorization = (AUTHORIZATIONS[credential.kind] as (
      credential: Credential,
    ) => Record<string, string>)(credential);
    const response = await this.fetcher(`${this.origin}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "ensemble-platform",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...authorization,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const reason = await response.json().then(
        (answer) => answer?.message ?? response.statusText,
        () => response.statusText,
      );
      throw new RefusedError(
        `GitHub refused ${method} ${path} (${response.status}): ${reason}`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
}
