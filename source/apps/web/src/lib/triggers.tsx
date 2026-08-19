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

/**
 * Human-readable label for a trigger, e.g. on a run button or in a run's
 * trigger column. A workflow can declare several `github:` entries (each
 * with its own `push.tags`/`context`) — appending the tag pattern(s)
 * disambiguates them, since they'd otherwise all render as plain "GitHub".
 * A workflow only ever has one `manual` entry in practice, so that case
 * stays a plain label.
 */
export function triggerTypeLabel(trigger: WorkflowTriggerSummary): string {
  switch (trigger.type) {
    case "manual":
      return "Manual";
    case "github":
      return trigger.tagPatterns.length > 0
        ? `GitHub — ${trigger.tagPatterns.join(", ")}`
        : "GitHub";
  }
}
