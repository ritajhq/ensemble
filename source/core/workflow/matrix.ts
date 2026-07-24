/**
 * Expands a matrix definition into the ordered Cartesian product of its
 * axes. Key order follows declaration order; value order follows each
 * axis's array order. This ordering is the single source of truth for
 * matrix instance indexing — the same array is used both to run the
 * instances and to index the arrays a downstream job sees via
 * `needs.<job>`, so the two can never drift apart.
 */
export function expandMatrix(matrix: Record<string, unknown[]>): Record<string, unknown>[] {
  const keys = Object.keys(matrix);
  return keys.reduce(
    (combos, key) => combos.flatMap((combo) => matrix[key].map((value) => ({ ...combo, [key]: value }))),
    [{}] as Record<string, unknown>[],
  );
}
