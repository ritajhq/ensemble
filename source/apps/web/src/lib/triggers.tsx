import { Unplug } from "lucide-react";
import { GithubIcon } from "@ritaj/ui";
import type { WorkflowTriggerSummary } from "./api.ts";

/** Icon representing a trigger's type, e.g. next to its name or on its run button. */
export function TriggerIcon(
  { trigger, className, title }: { trigger: WorkflowTriggerSummary; className?: string; title?: string },
) {
  switch (trigger.type) {
    case "manual":
      return <Unplug className={className}>{title && <title>{title}</title>}</Unplug>;
    case "github":
      return <GithubIcon className={className}>{title && <title>{title}</title>}</GithubIcon>;
  }
}

/** Human-readable label for a trigger type, e.g. on a run button or in a run's trigger column. */
export function triggerTypeLabel(type: WorkflowTriggerSummary["type"]): string {
  switch (type) {
    case "manual":
      return "Manual";
    case "github":
      return "GitHub";
  }
}
