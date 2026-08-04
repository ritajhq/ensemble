import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@ritaj/ui";
import { highlight, splitHighlightedLines } from "../lib/highlight.ts";

export function WorkflowFileViewer(
  { path, content, error }: { path: string | null; content: string | null; error: string | null },
) {
  const [wrapLines, setWrapLines] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  const highlighted = useMemo(
    () => path && content !== null ? highlight(content, path) : null,
    [path, content],
  );
  const lines = useMemo(
    () => highlighted ? splitHighlightedLines(highlighted.html) : null,
    [highlighted],
  );

  if (!path) {
    return <p className="p-4 text-sm text-muted-foreground">Select a file to view its contents.</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="File view options" />}
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={wrapLines}
              onCheckedChange={setWrapLines}
            >
              Wrap lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showLineNumbers}
              onCheckedChange={setShowLineNumbers}
            >
              Line numbers
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-auto p-3 pl-0">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && content === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!error && content !== null && lines && (
          <pre
            className="hljs grid font-mono text-xs"
            style={{ gridTemplateColumns: showLineNumbers ? "auto 1fr" : "1fr" }}
          >
            {lines.map((lineHtml, index) => (
              <div className="contents" key={index}>
                {showLineNumbers && (
                  <span className="sticky left-0 mr-3 min-w-8 shrink-0 select-none bg-background px-2 pl-4 text-right text-muted-foreground/60">
                    {index + 1}
                  </span>
                )}
                <code
                  className={wrapLines ? "whitespace-pre-wrap" : "whitespace-pre"}
                  // deno-lint-ignore react-no-danger
                  dangerouslySetInnerHTML={{ __html: lineHtml }}
                />
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
