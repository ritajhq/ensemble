import { useState } from "react";
import { Container } from "../Container.tsx";
import { FileIcon, FolderIcon } from "../Icon.tsx";

/** One per principle in the README's "Principles" section — the reasons the layout is shaped this way. */
const CONCERNS = [
  {
    id: "apps",
    label: "App source",
    summary:
      "Every app is self-contained: everything it needs to build lives under its own folder, so you can think about one piece of the project without the details of other concerns leaking in.",
  },
  {
    id: "shared",
    label: "Shared code",
    summary:
      "Cross-cutting code is pulled in deliberately rather than reached for across app folders. One folder speaks your project's domain, the other stays generic and reusable.",
  },
  {
    id: "output",
    label: "Build output",
    summary:
      "Builds land in their own top-level home beside the source and stay out of git, so you work on the layer you're changing instead of yesterday's build.",
  },
  {
    id: "packaging",
    label: "Packaging",
    summary:
      "How an app becomes a deployable artifact lives outside the app folder — the source you read stays free of packaging ceremony.",
  },
  {
    id: "kits",
    label: "Kits",
    summary:
      "Build, pack, and deploy logic, each behind a common contract. An app declares which kit it uses, never how that kit does its job.",
  },
  {
    id: "delivery",
    label: "Delivery",
    summary:
      "One declarative manifest per workload — computes, databases, storage, networking, secrets — reconciled to the state it declares, whether locally or in production.",
  },
] as const;

type ConcernId = (typeof CONCERNS)[number]["id"];

interface TreeRow {
  /** Nesting inside its top-level folder; the layout is never deeper than this. */
  depth: 0 | 1;
  path: string;
  note?: string;
  concern?: ConcernId;
}

/** The layout `ens init` lays down. */
const TREE: TreeRow[] = [
  { depth: 0, path: "source/" },
  {
    depth: 1,
    path: "apps/<name>/",
    note: "app source, one folder per deployable unit",
    concern: "apps",
  },
  {
    depth: 1,
    path: "core/",
    note: "shared code that speaks your project's domain",
    concern: "shared",
  },
  {
    depth: 1,
    path: "libs/",
    note: "generic code, reusable across projects",
    concern: "shared",
  },
  {
    depth: 1,
    path: "artifacts/<name>/",
    note: "build output, content gitignored",
    concern: "output",
  },
  {
    depth: 1,
    path: "ship/<name>/",
    note: "packaging inputs (Dockerfile, …)",
    concern: "packaging",
  },
  { depth: 0, path: "ci/<name>/" },
  {
    depth: 1,
    path: "delivery.yml",
    note: "the workload's delivery manifest",
    concern: "delivery",
  },
  { depth: 0, path: ".ensemble/" },
  {
    depth: 1,
    path: "kits/<build|pack|deploy>/",
    note: "where kits live, vendored for inspection and customization",
    concern: "kits",
  },
  {
    depth: 1,
    path: "config.yaml",
    note:
      "long-lived configuration for the project, to avoid repeating flags across commands",
    concern: "kits",
  },
];

function TreePath({ path }: { path: string }) {
  // The `<name>` / `<kit>` placeholders read as placeholders, not as part of a literal path.
  return (
    <>
      {path.split(/(<[^>]+>)/).map((part, index) =>
        part.startsWith("<")
          ? (
            <span key={index} className="text-blue-500">
              {part}
            </span>
          )
          : <span key={index}>{part}</span>
      )}
    </>
  );
}

/** The workspace layout, with each top-level folder answerable to a principle. */
export function Workspace() {
  const [activeId, setActiveId] = useState<ConcernId>("apps");
  const active = CONCERNS.find((concern) => concern.id === activeId) ??
    CONCERNS[0];

  const pick = (id: ConcernId) => () => setActiveId(id);

  return (
    <section className="py-20">
      <Container>
        <p className="text-center text-xs font-semibold tracking-widest text-blue-600 uppercase">
          The workspace
        </p>
        <h2 className="mt-2 text-center font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Designed to make sense at a glance
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-600">
          Every concern gets its own top-level home. Nothing is hidden behind a
          convention you have to remember, so the structure alone tells you
          where you are — when you first clone the repo and three months in.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {CONCERNS.map((concern) => {
            const isActive = concern.id === activeId;
            return (
              <button
                key={concern.id}
                type="button"
                aria-pressed={isActive}
                onClick={pick(concern.id)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {concern.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="divide-y divide-slate-100">
            {TREE.map((row) => {
              const isActive = row.concern === activeId;
              const isRoot = row.depth === 0;
              const isDir = row.path.endsWith("/");
              const RowIcon = isDir ? FolderIcon : FileIcon;
              return (
                <div
                  key={row.path}
                  className={`flex flex-col gap-x-4 gap-y-0.5 px-4 py-2 transition sm:flex-row sm:items-center ${
                    isActive ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 sm:w-[16rem] sm:shrink-0">
                    {row.depth === 1 && (
                      <span aria-hidden="true" className="w-3.5 shrink-0" />
                    )}
                    <RowIcon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-blue-500" : "text-slate-400"
                      }`}
                    />
                    <span
                      className={`truncate font-mono text-[13px] ${
                        isActive
                          ? "font-medium text-blue-800"
                          : isRoot
                          ? "font-medium text-slate-900"
                          : "text-slate-600"
                      }`}
                    >
                      <TreePath path={row.path} />
                    </span>
                  </span>
                  {row.note && (
                    <span
                      className={`pl-8 font-mono text-xs sm:pl-0 ${
                        isActive ? "text-blue-600/80" : "text-slate-400"
                      }`}
                    >
                      {row.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            aria-live="polite"
            className="border-t border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-relaxed text-slate-600 sm:px-5"
          >
            <span className="font-mono text-xs font-medium text-blue-700">
              {active.label}
            </span>
            <span aria-hidden="true" className="mx-2 text-slate-300">
              /
            </span>
            {active.summary}
          </div>
        </div>
      </Container>
    </section>
  );
}
