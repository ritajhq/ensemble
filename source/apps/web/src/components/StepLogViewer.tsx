import { useState } from "react";
import { Button } from "@ritaj/ui";
import { CheckIcon, CopyIcon } from "lucide-react";

function CopyLogButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Copy log">
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

function LogBlock({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");

  return (
    <pre className={`font-mono text-xs ${className ?? ""}`}>
      {lines.map((line, index) => (
        <div key={index} className="flex">
          <span className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground/50">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{line}</span>
        </div>
      ))}
    </pre>
  );
}

export function StepLogViewer(
  { jobId, label, log, error }: {
    jobId: string;
    label: string;
    log: { stdout: string; stderr: string; truncated: boolean } | null;
    error: string | null;
  },
) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{jobId} / {label}</span>
        {log !== null && (log.stdout !== "" || log.stderr !== "") && (
          <CopyLogButton text={[log.stdout, log.stderr].filter(Boolean).join("\n")} />
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 px-1">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && log === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!error && log !== null && (
          <>
            {log.truncated && (
              <p className="mb-2 text-xs text-muted-foreground">Log truncated — showing only the captured portion.</p>
            )}
            {log.stdout === "" && log.stderr === "" && (
              <p className="text-sm text-muted-foreground">No output captured for this step.</p>
            )}
            {log.stdout !== "" && <LogBlock text={log.stdout} />}
            {log.stderr !== "" && <LogBlock text={log.stderr} className="mt-3 text-destructive" />}
          </>
        )}
      </div>
    </div>
  );
}
