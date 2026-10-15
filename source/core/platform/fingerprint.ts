/** FNV-1a, 32 bits, as eight hex digits: a stable short fingerprint of a name, not a security boundary. */
export class Fingerprint {
  static readonly LENGTH = 8;

  static of(text: string): string {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(text)) {
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(Fingerprint.LENGTH, "0");
  }
}
