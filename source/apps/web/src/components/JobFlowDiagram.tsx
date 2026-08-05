import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { Badge, cn } from "@ritaj/ui";
import { statusVariant } from "../lib/status.ts";
import { layoutJobGraph } from "../lib/job-graph.ts";
import type { RunJobNode } from "../lib/api.ts";

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 76;
const NODE_WIDTH = 176;

interface JobNodeData extends Record<string, unknown> {
  jobId: string;
  status?: string;
}

function JobNode({ data, id }: NodeProps<Node<JobNodeData>>) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <button
        type="button"
        data-job-id={id}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-ring",
        )}
        style={{ width: NODE_WIDTH }}
      >
        <span className="truncate text-sm font-medium">{data.jobId}</span>
        <Badge variant={statusVariant(data.status)} className="shrink-0">
          {data.status ?? "pending"}
        </Badge>
      </button>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </>
  );
}

const nodeTypes = { job: JobNode };

export function JobFlowDiagram(
  { jobs, jobStatuses, onSelectJob }: {
    jobs: RunJobNode[];
    jobStatuses: Record<string, string>;
    onSelectJob: (jobId: string) => void;
  },
) {
  const { nodes, edges } = useMemo(() => {
    const laidOut = layoutJobGraph(jobs);

    const nodes: Node<JobNodeData>[] = laidOut.map((job) => ({
      id: job.id,
      type: "job",
      position: { x: job.column * COLUMN_WIDTH, y: job.row * ROW_HEIGHT },
      data: { jobId: job.id, status: jobStatuses[job.id] },
    }));

    const edges: Edge[] = laidOut.flatMap((job) =>
      job.needs.map((dep) => ({
        id: `${dep}->${job.id}`,
        source: dep,
        target: job.id,
        type: "smoothstep",
        style: { stroke: "var(--border)" },
      }))
    );

    return { nodes, edges };
  }, [jobs, jobStatuses]);

  return (
    <div className="h-[min(60vh,420px)] w-full overflow-hidden rounded-lg border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelectJob(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        minZoom={0.5}
        maxZoom={1}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-40" />
      </ReactFlow>
    </div>
  );
}
