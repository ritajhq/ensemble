import { Badge } from "@ritaj/ui";
import type { Sync } from "../api.ts";

/** How each sync state reads. */
const STATES: Readonly<
  Record<Sync["state"], { label: string; color: "blue" | "green" | "red" }>
> = {
  syncing: { label: "Syncing", color: "blue" },
  synced: { label: "Synced", color: "green" },
  failed: { label: "Sync failed", color: "red" },
};

export function SyncBadge({ state }: { state: Sync["state"] }) {
  return <Badge color={STATES[state].color}>{STATES[state].label}</Badge>;
}
