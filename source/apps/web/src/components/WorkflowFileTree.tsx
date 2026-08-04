import { File, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { WorkflowFileNode } from "../lib/api.ts";
import { cn } from "@ritaj/ui";

function TreeNode(
  { node, depth, selectedPath, onSelectFile }: {
    node: WorkflowFileNode;
    depth: number;
    selectedPath: string | null;
    onSelectFile: (path: string) => void;
  },
) {
  const [open, setOpen] = useState(true);

  if (node.type === "file") {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground",
          selectedPath === node.path && "bg-accent font-medium text-accent-foreground",
        )}
        style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
        onClick={() => onSelectFile(node.path)}
      >
        <File className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.path.split("/").pop()}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          : <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate">{node.path.split("/").pop()}</span>
      </button>
      {open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowFileTree(
  { files, selectedPath, onSelectFile }: {
    files: WorkflowFileNode[];
    selectedPath: string | null;
    onSelectFile: (path: string) => void;
  },
) {
  if (files.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No files.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-auto p-2">
      {files.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelectFile={onSelectFile} />
      ))}
    </div>
  );
}
