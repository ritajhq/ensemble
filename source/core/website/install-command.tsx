import { useState } from "react";
import { CheckIcon, CopyIcon } from "./Icon.tsx";
import { INSTALL_COMMAND } from "./constants.ts";

const COPIED_RESET_MS = 2000;

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white/80 py-2.5 pr-3 pl-5 font-mono text-[13px] text-ink shadow-sm backdrop-blur">
      <span className="select-none text-aegean">$</span>
      <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {INSTALL_COMMAND}
      </code>
      <button
        type="button"
        onClick={copyCommand}
        aria-label="Copy install command"
        className="shrink-0 rounded-full p-1.5 text-stone transition hover:bg-marble hover:text-ink"
      >
        {copied
          ? <CheckIcon className="h-4 w-4 text-olive" />
          : <CopyIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}
