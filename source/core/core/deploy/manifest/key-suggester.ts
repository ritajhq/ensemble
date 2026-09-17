/** Suggests the closest known key to an unrecognized one, for a legible "unknown key X — did you mean Y?" error. */
export class KeySuggester {
  /** Returns the closest known key within edit-distance 2 of `key`, or undefined if none is close enough to be worth suggesting. */
  suggestFor(key: string, knownKeys: readonly string[]): string | undefined {
    let best: { key: string; distance: number } | undefined;
    for (const candidate of knownKeys) {
      const distance = this.editDistance(key, candidate);
      if (distance > 2) continue;
      if (!best || distance < best.distance) {
        best = { key: candidate, distance };
      }
    }
    return best?.key;
  }

  private editDistance(a: string, b: string): number {
    const rows = new Array<number[]>(a.length + 1);
    for (let i = 0; i <= a.length; i++) {
      rows[i] = new Array<number>(b.length + 1);
      rows[i][0] = i;
    }
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + cost,
        );
      }
    }
    return rows[a.length][b.length];
  }
}
