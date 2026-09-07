import { useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "./Icon.tsx";
import { INSTALL_COMMAND, INSTALL_SCRIPT_URL } from "./constants.ts";

const COPIED_RESET_MS = 2000;

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-500">Install Ensemble v0.0.11</p>

      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-700">
        <span className="select-none text-blue-600">$</span>
        <code className="flex-1 overflow-x-auto whitespace-pre">{INSTALL_COMMAND}</code>
        <button
          type="button"
          onClick={copyCommand}
          aria-label="Copy install command"
          className="shrink-0 text-slate-400 transition hover:text-slate-600"
        >
          {copied ? <CheckIcon className="h-4 w-4 text-blue-600" /> : <CopyIcon className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-2 flex justify-end">
        <a
          href={INSTALL_SCRIPT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-blue-600"
        >
          View install script
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
