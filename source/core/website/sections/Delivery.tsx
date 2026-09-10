import type { ComponentType } from "react";
import { AwsMark, DockerMark, KubernetesMark } from "../BrandMark.tsx";
import { Container } from "../Container.tsx";

type Tone = "root" | "group" | "entry" | "field" | "value" | "ref" | "comment";

interface Segment {
  tone: Tone;
  text: string;
}

/** One line of the manifest, split into colored segments — a `key: value` where the parts read differently. */
interface Line {
  segs: Segment[];
}

const MANIFEST: Line[] = [
  {
    segs: [{
      tone: "comment",
      text: "# what the workload is — not how to build it",
    }],
  },
  { segs: [] },
  { segs: [{ tone: "root", text: "release:" }] },
  { segs: [{ tone: "entry", text: "  app:" }] },
  {
    segs: [{ tone: "field", text: "    kit: " }, {
      tone: "value",
      text: "docker",
    }],
  },
  { segs: [] },
  { segs: [{ tone: "root", text: "deploy:" }] },
  { segs: [{ tone: "group", text: "  compute:" }] },
  { segs: [{ tone: "entry", text: "    server:" }] },
  {
    segs: [{ tone: "field", text: "      type: " }, {
      tone: "value",
      text: "container-orchestrated",
    }],
  },
  {
    segs: [{ tone: "field", text: "      replicas: " }, {
      tone: "value",
      text: "2",
    }],
  },
  {
    segs: [{ tone: "field", text: "      image: " }, {
      tone: "ref",
      text: "${release.app.image}",
    }],
  },
  { segs: [{ tone: "field", text: "      env:" }] },
  {
    segs: [
      { tone: "field", text: "        DATABASE_URL: " },
      { tone: "ref", text: "${databases.db.connectionString}" },
    ],
  },
  {
    segs: [
      { tone: "field", text: "        CACHE_URL: " },
      { tone: "ref", text: "${databases.cache.connectionString}" },
    ],
  },
  { segs: [] },
  { segs: [{ tone: "group", text: "  databases:" }] },
  { segs: [{ tone: "entry", text: "    db:" }] },
  {
    segs: [{ tone: "field", text: "      type: " }, {
      tone: "value",
      text: "relational",
    }],
  },
  { segs: [{ tone: "entry", text: "    cache:" }] },
  {
    segs: [{ tone: "field", text: "      type: " }, {
      tone: "value",
      text: "key-value",
    }],
  },
];

const TONE_CLASS: Record<Tone, string> = {
  root: "font-medium text-term-accent",
  group: "text-term-accent",
  entry: "font-medium text-term-fg",
  field: "text-term-muted",
  value: "text-term-fg",
  ref: "text-term-yellow",
  comment: "text-term-muted",
};

interface Mapping {
  entry: string;
  becomes: string;
}

interface Target {
  /** The kit name, as it's passed to `ens deploy`. */
  kit: string;
  label: string;
  runsOn: string;
  mark: ComponentType<{ className?: string }>;
  mapping: Mapping[];
}

/** Each kit reads the same entries and lands them on whatever its target offers. */
const TARGETS: Target[] = [
  {
    kit: "compose",
    label: "Docker Compose",
    runsOn: "One host — your machine or a bare-metal box.",
    mark: DockerMark,
    mapping: [
      {
        entry: "compute.server",
        becomes: "a container, reached through a Caddy gateway",
      },
      { entry: "databases.db", becomes: "postgres:16 on a named volume" },
      { entry: "databases.cache", becomes: "valkey/valkey:8" },
    ],
  },
  {
    kit: "aws",
    label: "AWS",
    runsOn: "Managed services in your own account.",
    mark: AwsMark,
    mapping: [
      { entry: "compute.server", becomes: "an ECS service running 2 tasks" },
      { entry: "databases.db", becomes: "RDS for PostgreSQL" },
      { entry: "databases.cache", becomes: "a DynamoDB table" },
    ],
  },
  {
    kit: "kubernetes",
    label: "Kubernetes",
    runsOn: "Any cluster — EKS, GKE, AKS, or on-prem.",
    mark: KubernetesMark,
    mapping: [
      {
        entry: "compute.server",
        becomes: "a Deployment and Service at 2 replicas",
      },
      { entry: "databases.db", becomes: "a StatefulSet with its own volume" },
      { entry: "databases.cache", becomes: "a Redis Deployment and Service" },
    ],
  },
];

function ManifestLine({ line }: { line: Line }) {
  if (line.segs.length === 0) return <div>&nbsp;</div>;
  return (
    <div>
      {line.segs.map((seg, index) => (
        <span key={index} className={TONE_CLASS[seg.tone]}>
          {seg.text}
        </span>
      ))}
    </div>
  );
}

/** One declarative manifest, translated by whichever kit is pointed at it. */
export function Delivery() {
  return (
    <section className="py-20">
      <Container>
        <p className="text-center text-xs font-semibold tracking-widest text-blue-600 uppercase">
          Delivery
        </p>
        <h2 className="mt-2 text-center font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          One manifest, every target
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-600">
          A delivery manifest describes what your workload is — the compute, the
          databases, the storage, the routes — and nothing about how any of it
          gets built. The kit you point at it decides that.
        </p>

        <div className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-xl border border-term-border bg-term-bg shadow-sm">
          <div className="flex items-center justify-between border-b border-term-border px-4 py-2.5">
            <span className="font-mono text-xs text-term-muted">
              ci/app/delivery.yml
            </span>
            <span className="font-mono text-xs text-term-muted">
              one manifest
            </span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed sm:p-5 sm:text-[13px]">
            {MANIFEST.map((line, index) => <ManifestLine key={index} line={line} />)}
          </pre>
        </div>

        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
            read three ways
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {TARGETS.map(({ mark: Mark, ...target }) => (
            <div
              key={target.kit}
              className="relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <Mark className="absolute top-4 right-4 h-8 w-8" />
              <h3 className="pr-11 font-semibold text-slate-900">
                {target.label}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                kit: {target.kit}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {target.runsOn}
              </p>

              <dl className="mt-5 space-y-3.5">
                {target.mapping.map((row) => (
                  <div key={row.entry}>
                    <dt className="font-mono text-[11px] text-slate-400">
                      {row.entry}
                    </dt>
                    <dd className="mt-0.5 text-sm leading-snug text-slate-700">
                      {row.becomes}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-auto pt-5 font-mono text-[11px] text-slate-500">
                <span aria-hidden="true" className="select-none text-slate-300">
                  $
                </span>
                ens deploy app {target.kit}
              </p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-relaxed text-slate-500">
          Your app only ever reads a reference like{" "}
          <span className="font-mono text-xs text-slate-700">
            {"${databases.cache.connectionString}"}
          </span>{" "}
          and the kit resolves it to whatever the target actually provides.
          Reaching a new provider means writing a kit, not rewriting your apps.
        </p>
      </Container>
    </section>
  );
}
