import { type DependencyList, useCallback, useEffect, useState } from "react";
import { describe } from "./api.ts";

/** Something loaded from the platform, and how that went. */
export interface Loaded<T> {
  readonly value: T | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  /** Loads it again. */
  readonly reload: () => void;
}

/** Loads `load` when the component mounts and whenever `deps` change. */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: DependencyList,
): Loaded<T> {
  const [value, setValue] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    load()
      .then((loaded) => {
        if (!current) return;
        setValue(loaded);
        setError(undefined);
      })
      .catch((e) => current && setError(describe(e)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [...deps, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { value, error, loading, reload };
}
