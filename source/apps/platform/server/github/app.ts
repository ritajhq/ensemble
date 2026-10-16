/** How long an app's JWT is good for: GitHub allows ten minutes at most. */
const JWT_LIFETIME_SECONDS = 9 * 60;
/** How far back an app's JWT is dated, for a clock running ahead of GitHub's. */
const CLOCK_DRIFT_SECONDS = 60;

const SIGNATURE_PREFIX = "sha256=";

/** What an `App` is made of, as GitHub hands it over when the app is created. */
export interface AppFields {
  readonly id: number;
  readonly slug: string;
  /** The account it belongs to: a user's or an organization's login. */
  readonly owner: string;
  /** The app's page on GitHub. */
  readonly htmlUrl: string;
  /** The id of the app's bot user, whose noreply address its commits carry. */
  readonly botId: number;
  /** PEM, PKCS#1 (`BEGIN RSA PRIVATE KEY`), as GitHub issues it. */
  readonly privateKey: string;
  readonly webhookSecret: string;
}

/**
 * The GitHub App this platform acts as: created once, at setup, under the
 * account its operator chose; installed on whichever repositories that
 * account's owners let it reach. It proves who it is with a short-lived JWT
 * signed by its private key, and every webhook GitHub sends it is signed with
 * its webhook secret.
 */
export class App {
  private constructor(private readonly fields: AppFields) {}

  static of(fields: AppFields): App {
    return new App(fields);
  }

  get id(): number {
    return this.fields.id;
  }

  get slug(): string {
    return this.fields.slug;
  }

  get owner(): string {
    return this.fields.owner;
  }

  get htmlUrl(): string {
    return this.fields.htmlUrl;
  }

  /** Where an account's owner installs the app on its repositories. */
  get installUrl(): string {
    return `https://github.com/apps/${this.fields.slug}/installations/new`;
  }

  /** Who the app's commits and tags are made as: its bot user, at GitHub's noreply address for it. */
  get bot(): { readonly name: string; readonly email: string } {
    const name = `${this.fields.slug}[bot]`;
    return {
      name,
      email: `${this.fields.botId}+${name}@users.noreply.github.com`,
    };
  }

  /** What is kept of it, its two secrets among them: for its store to seal. */
  get record(): AppFields {
    return this.fields;
  }

  /** A JWT that proves to GitHub it is this app, for the few minutes GitHub allows. */
  async jwt(at: Date = new Date()): Promise<string> {
    const now = Math.floor(at.getTime() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iat: now - CLOCK_DRIFT_SECONDS,
      exp: now + JWT_LIFETIME_SECONDS,
      iss: String(this.fields.id),
    };
    const unsigned = `${base64url(JSON.stringify(header))}.${
      base64url(JSON.stringify(claims))
    }`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8Of(this.fields.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    );
    return `${unsigned}.${base64url(new Uint8Array(signature))}`;
  }

  /** Whether `body` was signed with the app's webhook secret, as `X-Hub-Signature-256` says. */
  async signed(
    body: Uint8Array<ArrayBuffer>,
    signature: string | null,
  ): Promise<boolean> {
    if (!signature?.startsWith(SIGNATURE_PREFIX)) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.fields.webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const hex = signature.slice(SIGNATURE_PREFIX.length);
    if (!/^[0-9a-f]{64}$/.test(hex)) return false;
    const expected = new Uint8Array(
      hex.match(/../g)!.map((pair) => parseInt(pair, 16)),
    );
    return await crypto.subtle.verify("HMAC", key, expected, body);
  }
}

function base64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A PKCS#1 RSA key (what GitHub issues) wrapped as PKCS#8 (what Web Crypto
 * imports): the same key, inside `PrivateKeyInfo { version 0, rsaEncryption,
 * OCTET STRING <the PKCS#1 key> }`. A key already in PKCS#8 passes through.
 */
function pkcs8Of(pem: string): Uint8Array<ArrayBuffer> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  if (!pem.includes("BEGIN RSA PRIVATE KEY")) return der;
  const version = [0x02, 0x01, 0x00];
  const rsaEncryption = [
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  ];
  const key = [0x04, ...lengthOf(der.length), ...der];
  const body = [...version, ...rsaEncryption, ...key];
  return new Uint8Array([0x30, ...lengthOf(body.length), ...body]);
}

/** A DER length: one byte under 128, otherwise its byte count, then its bytes. */
function lengthOf(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 | bytes.length, ...bytes];
}
