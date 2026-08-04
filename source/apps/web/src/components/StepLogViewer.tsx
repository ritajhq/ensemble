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
      <div className="border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{jobId} / {label}</span>
      </div>
      <div className="flex-1 overflow-auto p-3">
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
            {log.stdout !== "" && (
              <pre className="font-mono text-xs whitespace-pre-wrap">{log.stdout}</pre>
            )}
            {log.stderr !== "" && (
              <pre className="mt-3 font-mono text-xs whitespace-pre-wrap text-destructive">{log.stderr}</pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}
