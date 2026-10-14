import { Badge } from "@ritaj/ui";
import type { RunState } from "../api.ts";

/** How each run state reads. */
const STATES: Readonly<
  Record<RunState, { label: string; color: "gray" | "blue" | "green" | "red" }>
> = {
  queued: { label: "Queued", color: "gray" },
  running: { label: "Running", color: "blue" },
  succeeded: { label: "Succeeded", color: "green" },
  failed: { label: "Failed", color: "red" },
};

export function RunBadge({ state }: { state: RunState }) {
  return <Badge color={STATES[state].color}>{STATES[state].label}</Badge>;
}
