import { isRouteErrorResponse, useRouteError } from "react-router";
import { describe } from "../api.ts";
import { Notice } from "../components/notice.tsx";

/** What a screen shows when it couldn't load: the reason, with the sidebar still there to go elsewhere. */
export function ScreenError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <Notice tone="error">{String(error.data ?? error.statusText)}</Notice>
    );
  }
  return <Notice tone="error">{describe(error)}</Notice>;
}
