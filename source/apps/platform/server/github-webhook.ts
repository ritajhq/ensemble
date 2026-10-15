/** A branch of a repository that appeared or moved (`pushed`), or went away (`deleted`). */
export interface BranchEvent {
  readonly kind: "pushed" | "deleted";
  /** `owner/name`. */
  readonly repository: string;
  readonly branch: string;
}

/** What to answer the sender, and the event if the request carried one worth acting on. */
export interface WebhookOutcome {
  readonly response: Response;
  readonly event?: BranchEvent;
}

const SIGNATURE_PREFIX = "sha256=";
const BRANCH_REF = "refs/heads/";

/**
 * One repository's GitHub webhook: authenticates the request against that
 * repository's own secret, then reads out the one thing a preview cares
 * about — which branch was pushed or deleted. Anything else (other events,
 * tags, a payload for another repository) is acknowledged and ignored.
 */
export class GithubWebhook {
  constructor(
    private readonly secret: string,
    /** `owner/name`: a payload naming another repository is refused even when correctly signed. */
    private readonly repository: string,
  ) {}

  async interpret(request: Request): Promise<WebhookOutcome> {
    const body = new Uint8Array(await request.arrayBuffer());
    if (!await this.signed(body, request.headers.get("x-hub-signature-256"))) {
      return reply("Invalid signature", 401);
    }

    const kind = request.headers.get("x-github-event");
    if (kind === "ping") return reply("pong", 200);
    if (kind !== "push" && kind !== "delete") {
      return reply("Ignored event", 202);
    }

    const payload = JSON.parse(new TextDecoder().decode(body)) as Payload;
    if (payload.repository?.full_name !== this.repository) {
      return reply("Wrong repository", 403);
    }

    const event = kind === "push"
      ? this.fromPush(payload)
      : this.fromDelete(payload);
    if (!event) return reply("Ignored ref", 202);
    return { response: new Response("Accepted", { status: 202 }), event };
  }

  private fromPush(payload: Payload): BranchEvent | undefined {
    if (!payload.ref?.startsWith(BRANCH_REF)) return undefined;
    return {
      kind: payload.deleted ? "deleted" : "pushed",
      repository: this.repository,
      branch: payload.ref.slice(BRANCH_REF.length),
    };
  }

  private fromDelete(payload: Payload): BranchEvent | undefined {
    if (payload.ref_type !== "branch" || !payload.ref) return undefined;
    return {
      kind: "deleted",
      repository: this.repository,
      branch: payload.ref,
    };
  }

  /** `X-Hub-Signature-256` is the HMAC-SHA256 of the raw body under the secret; `verify` compares in constant time. */
  private async signed(
    body: Uint8Array<ArrayBuffer>,
    header: string | null,
  ): Promise<boolean> {
    if (!header?.startsWith(SIGNATURE_PREFIX)) return false;
    const signature = hexBytes(header.slice(SIGNATURE_PREFIX.length));
    if (!signature) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, signature, body);
  }
}

interface Payload {
  ref?: string;
  ref_type?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
}

function reply(message: string, status: number): WebhookOutcome {
  return { response: new Response(message, { status }) };
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
