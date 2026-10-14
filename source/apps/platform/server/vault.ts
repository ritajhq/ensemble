/** A secret as it is kept: AES-GCM ciphertext and the nonce it was sealed with, both base64. */
export interface Sealed {
  readonly iv: string;
  readonly data: string;
}

/** Thrown when the key the platform was given can't be one. */
export class InvalidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKeyError";
  }
}

/**
 * Seals secrets before they are stored and opens them when a deploy needs
 * them, with one AES-256-GCM key the platform is given at start
 * (`PLATFORM_SECRET_KEY`, base64 of 32 random bytes: `openssl rand -base64
 * 32`). Each secret is sealed to where it is kept (`context`), so a sealed
 * value copied under another environment's key doesn't open.
 */
export class Vault {
  private constructor(private readonly key: CryptoKey) {}

  static async of(base64: string): Promise<Vault> {
    let raw: Uint8Array<ArrayBuffer>;
    try {
      raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } catch {
      throw new InvalidKeyError("PLATFORM_SECRET_KEY isn't base64.");
    }
    if (raw.length !== 32) {
      throw new InvalidKeyError(
        `PLATFORM_SECRET_KEY must be 32 bytes, base64 (openssl rand -base64 32); got ${raw.length}.`,
      );
    }
    return new Vault(
      await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]),
    );
  }

  async seal(value: string, context: readonly string[]): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: this.bind(context) },
      this.key,
      new TextEncoder().encode(value),
    );
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
  }

  async open(sealed: Sealed, context: readonly string[]): Promise<string> {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(sealed.iv),
        additionalData: this.bind(context),
      },
      this.key,
      fromBase64(sealed.data),
    );
    return new TextDecoder().decode(plain);
  }

  private bind(context: readonly string[]): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(JSON.stringify(context));
  }
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
