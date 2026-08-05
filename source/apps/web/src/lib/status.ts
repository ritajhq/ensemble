const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/** "3 minutes ago" for anything under a day old, else the plain locale date/time. */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const seconds = (date.getTime() - Date.now()) / 1000;

  if (Math.abs(seconds) < 60 * 60 * 24) {
    for (const [unit, unitSeconds] of RELATIVE_TIME_UNITS) {
      if (Math.abs(seconds) >= unitSeconds || unit === "second") {
        return relativeTimeFormatter.format(Math.round(seconds / unitSeconds), unit);
      }
    }
  }

  return date.toLocaleString();
}

export function formatDuration(startedAt: string, finishedAt?: string): string {
  if (!finishedAt) return "—";
  const seconds = Math.max(0, (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function statusVariant(
  status?: string,
): "success" | "destructive" | "info" | "outline" {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "destructive";
    case "pending":
    case "in_progress":
      return "info";
    default:
      return "outline";
  }
}

/** Tailwind classes for a solid status dot — used by connected-circle status rails. */
export function statusDotColor(status?: string): string {
  switch (status) {
    case "succeeded":
      return "bg-success border-success";
    case "failed":
      return "bg-destructive border-destructive";
    case "pending":
    case "in_progress":
      return "bg-info border-info";
    default:
      return "bg-transparent border-muted-foreground/40";
  }
}
