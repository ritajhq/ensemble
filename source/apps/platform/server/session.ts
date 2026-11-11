import type { Endpoints } from "./endpoints.ts";

/** Where the guard in front of the platform says who is calling. */
const SUBJECT_HEADER = "x-idhn-subject";
const CLAIMS_HEADER = "x-idhn-claims";

/** The sign-in the platform's operators come through: khatm. */
export interface SignIn {
  /** khatm reached directly, inside the platform's network: its API ends sessions. */
  readonly service: URL;
  /** khatm's public sign-in page, where a signed-out operator is sent. */
  readonly page: string;
}

/** Who is using the platform, as the guard vouches for them. */
interface Operator {
  readonly subject: string;
  readonly email?: string;
  readonly name?: string;
  readonly role?: string;
}

/**
 * The calling operator's session: who they are, from the `x-idhn-*` headers
 * the guard in front of the platform sets (it drops any a caller sent, so
 * they can be trusted), and signing them out at khatm.
 *
 * Signing out happens here rather than in the browser: the session cookie is
 * khatm's, and the web app may only talk to the platform.
 */
export class Session {
  constructor(endpoints: Endpoints, private readonly signIn?: SignIn) {
    endpoints.add("GET", "/api/session", (request) => this.operator(request));
    endpoints.add(
      "POST",
      "/api/session/sign-out",
      (request) => this.signOut(request),
    );
  }

  private operator(request: Request): Promise<Response> {
    const subject = request.headers.get(SUBJECT_HEADER);
    if (!subject) {
      return Promise.resolve(
        Response.json({ error: "No one is signed in" }, { status: 401 }),
      );
    }
    const operator: Operator = {
      ...this.claimsOf(request.headers.get(CLAIMS_HEADER)),
      subject,
    };
    return Promise.resolve(Response.json(operator));
  }

  /** Ends the session at khatm and hands its cookie-clearing headers back, with where to sign in again. */
  private async signOut(request: Request): Promise<Response> {
    if (!this.signIn) {
      return Response.json(
        { error: "The platform has no sign-in to sign out of" },
        { status: 404 },
      );
    }
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) {
      // khatm accepts it from a trusted origin only: the platform's, which
      // the browser stated on its own request.
      const ended = await fetch(
        new URL("/api/auth/sign-out", this.signIn.service),
        {
          method: "POST",
          headers: {
            cookie,
            origin: request.headers.get("origin") ?? "",
            "content-type": "application/json",
          },
          body: "{}",
        },
      );
      await ended.body?.cancel();
      for (const setCookie of ended.headers.getSetCookie()) {
        headers.append("set-cookie", setCookie);
      }
    }
    return Response.json({ signIn: this.signIn.page }, { headers });
  }

  private claimsOf(header: string | null): Omit<Operator, "subject"> {
    if (!header) return {};
    try {
      const json = new TextDecoder().decode(
        Uint8Array.from(
          atob(header.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      );
      const claims = JSON.parse(json) as Record<string, unknown>;
      return {
        ...this.text(claims, "email"),
        ...this.text(claims, "name"),
        ...this.text(claims, "role"),
      };
    } catch {
      return {};
    }
  }

  private text(
    claims: Record<string, unknown>,
    name: "email" | "name" | "role",
  ): Partial<Operator> {
    const value = claims[name];
    return typeof value === "string" ? { [name]: value } : {};
  }
}
