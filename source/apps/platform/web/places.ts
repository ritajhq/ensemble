import { useEffect, useState } from "react";

/** Where the URL's hash points: `#/projects/<id>`, `#/runs/<id>`, `#/new`, or nowhere yet. */
export type Place =
  | { readonly kind: "welcome" }
  | { readonly kind: "new" }
  | { readonly kind: "project"; readonly id: string }
  | { readonly kind: "run"; readonly id: string };

/** Each place that names something, by the hash path it lives under. */
const NAMED: ReadonlyArray<
  [RegExp, (id: string) => Place]
> = [
  [/^#\/projects\/([^/]+)$/, (id) => ({ kind: "project", id })],
  [/^#\/runs\/([^/]+)$/, (id) => ({ kind: "run", id })],
];

export function placeOf(hash: string): Place {
  for (const [pattern, place] of NAMED) {
    const match = pattern.exec(hash);
    if (match) return place(decodeURIComponent(match[1]));
  }
  if (hash === "#/new") return { kind: "new" };
  return { kind: "welcome" };
}

/** The place the URL's hash names, following it as it changes. */
export function usePlace(): Place {
  const [place, setPlace] = useState(() => placeOf(location.hash));
  useEffect(() => {
    const onHash = () => setPlace(placeOf(location.hash));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return place;
}

export function go(hash: string): void {
  location.hash = hash;
}

export function projectHash(id: string): string {
  return `#/projects/${encodeURIComponent(id)}`;
}

export function runHash(id: string): string {
  return `#/runs/${encodeURIComponent(id)}`;
}
