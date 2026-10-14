import { createContext, type ReactNode, useContext } from "react";
import type { Api } from "./api.ts";

const ApiContext = createContext<Api | undefined>(undefined);

/** Hands the one `Api` the app was wired with to every screen. */
export function ApiProvider(
  { api, children }: { api: Api; children: ReactNode },
) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi outside ApiProvider");
  return api;
}
