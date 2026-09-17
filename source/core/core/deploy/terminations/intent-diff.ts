export type DiffLineKind = "added" | "removed" | "unchanged";

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

/** What changed between the last-rendered artifact and this render (Section 9's intent-diff — new artifacts vs. the last-rendered cache, pure and offline, no target read). `changed` is false only when every line is unchanged. */
export interface IntentDiff {
  readonly lines: readonly DiffLine[];
  readonly changed: boolean;
}

/**
 * A pure line-based diff over two text blobs, via the standard LCS
 * (longest-common-subsequence) table — iterative, since this is genuinely a
 * table-filling problem, not a recursive one in disguise. No `previous` (the
 * very first plan/apply, before any cache exists) means every line is
 * reported `added`.
 */
export class IntentDiffer {
  diff(previous: string | undefined, current: string): IntentDiff {
    const previousLines = previous === undefined ? [] : previous.split("\n");
    const currentLines = current.split("\n");

    const lines = this.diffLines(previousLines, currentLines);
    return { lines, changed: lines.some((line) => line.kind !== "unchanged") };
  }

  private diffLines(
    previous: readonly string[],
    current: readonly string[],
  ): DiffLine[] {
    const table = this.longestCommonSubsequenceTable(previous, current);

    const lines: DiffLine[] = [];
    let i = previous.length;
    let j = current.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && previous[i - 1] === current[j - 1]) {
        lines.push({ kind: "unchanged", text: current[j - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
        lines.push({ kind: "added", text: current[j - 1] });
        j--;
      } else {
        lines.push({ kind: "removed", text: previous[i - 1] });
        i--;
      }
    }

    return lines.reverse();
  }

  private longestCommonSubsequenceTable(
    previous: readonly string[],
    current: readonly string[],
  ): number[][] {
    const table: number[][] = Array.from(
      { length: previous.length + 1 },
      () => new Array<number>(current.length + 1).fill(0),
    );

    for (let i = 1; i <= previous.length; i++) {
      for (let j = 1; j <= current.length; j++) {
        table[i][j] = previous[i - 1] === current[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
    return table;
  }
}
