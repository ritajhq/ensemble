interface IconProps {
  className?: string;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A repository/branch mark, for linking out to the source. */
export function RepoIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

/** An open book, for linking out to documentation. */
export function DocsIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5c.83 0 1.5-.67 1.5-1.5z" />
    </svg>
  );
}

/** A clipboard, for the install command's copy button. */
export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

/** A checkmark, for the install command's copy button once clicked. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** An arrow leaving a box, for a link that opens something outside the page. */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

/** A left-pointing chevron, for stepping to the previous item in a sequence. */
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** A right-pointing chevron, for stepping to the next item in a sequence. */
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** A circular arrow, for replaying a sequence from the start. */
export function ReplayIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className} aria-hidden="true">
      <path d="M4 12a8 8 0 1 1 2.343 5.657" />
      <path d="M4 17v-5h5" />
    </svg>
  );
}

/** The GitHub mark, for a compact icon-only link next to the primary CTA. */
export function GitHubMarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
