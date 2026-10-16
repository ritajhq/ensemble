import type { Apps } from "./apps.ts";

/** A branch of a repository that appeared or moved (`pushed`), or went away (`deleted`). */
export interface BranchEvent {
  readonly kind: "pushed" | "deleted";
  /** `owner/name`, as the payload names it. */
  readonly repository: string;
  readonly branch: string;
}

/** What to answer GitHub, and the event if the delivery carried one worth acting on. */
export interface Delivery {
  readonly response: Response;
  readonly event?: BranchEvent;
}

const BRANCH_REF = "refs/heads/";

interface Payload {
  ref?: string;
  ref_type?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
}

/** How each event GitHub sends is read: the branch it pushed or deleted, if any. */
const READINGS: Readonly<
  Record<
    string,
    (payload: Payload, repository: string) => BranchEvent | undefined
  >
> = {
  push: (payload, repository) => {
    if (!payload.ref?.startsWith(BRANCH_REF)) return undefined;
    return {
      kind: payload.deleted ? "deleted" : "pushed",
      repository,
      branch: payload.ref.slice(BRANCH_REF.length),
    };
  },
  delete: (payload, repository) => {
    if (payload.ref_type !== "branch" || !payload.ref) return undefined;
    return { kind: "deleted", repository, branch: payload.ref };
  },
};

/**
 * The app's one webhook, for every repository it's installed on: a delivery
 * is authenticated with the app's webhook secret, then read for the one thing
 * the platform acts on — which branch of which repository was pushed or
 * deleted. Anything else (installation events, tags, pings) is acknowledged
 * and ignored.
 */
export class Webhook {
  constructor(private readonly apps: Apps) {}

  async interpret(request: Request): Promise<Delivery> {
    const app = await this.apps.get();
    if (!app) return reply("No GitHub App set up", 404);

    const body = new Uint8Array(await request.arrayBuffer());
    if (!await app.signed(body, request.headers.get("x-hub-signature-256"))) {
      return reply("Invalid signature", 401);
    }

    const reading = READINGS[request.headers.get("x-github-event") ?? ""];
    if (!reading) return reply("Ignored event", 202);

    const payload = JSON.parse(new TextDecoder().decode(body)) as Payload;
    const repository = payload.repository?.full_name;
    if (!repository) return reply("No repository", 202);
    const event = reading(payload, repository);
    if (!event) return reply("Ignored ref", 202);
    return { response: new Response("Accepted", { status: 202 }), event };
  }
}

function reply(message: string, status: number): Delivery {
  return { response: new Response(message, { status }) };
}
