import { FileIcon, FolderIcon } from "./Icon.tsx";
import { SectionHeading } from "./section-heading.tsx";

interface Row {
  depth: 0 | 1;
  path: string;
  note?: string;
}

/** The layout `ens init` lays down, trimmed to what a newcomer needs to see. */
const TREE: Row[] = [
  { depth: 0, path: "source/" },
  { depth: 1, path: "apps/<name>/", note: "one folder per deployable app" },
  { depth: 1, path: "core/", note: "shared code that speaks your domain" },
  { depth: 1, path: "libs/", note: "generic code, reusable anywhere" },
  { depth: 1, path: "ship/<name>/", note: "how an app is packaged" },
  { depth: 0, path: "ci/<name>/" },
  { depth: 1, path: "delivery.yml", note: "the workload's manifest" },
  { depth: 0, path: ".ensemble/" },
  { depth: 1, path: "kits/", note: "build, pack, deploy, ecosystem" },
  {
    depth: 1,
    path: "ecosystems/<deno|node|cargo>/",
    note: "each language's tooling, out of your way",
  },
];

const POINTS = [
  {
    title: "Legible on day one",
    body:
      "The folder names tell a newcomer where things live, with no tour needed.",
  },
  {
    title: "Polyglot without the clutter",
    body:
      "Ecosystem kits keep each language's tool files under .ensemble, so only package manifests sit beside your code.",
  },
  {
    title: "Shared code on purpose",
    body:
      "Apps never reach into each other; what they share lives in core or libs.",
  },
];

function TreePath({ path }: { path: string }) {
  return (
    <>
      {path.split(/(<[^>]+>)/).map((part, index) =>
        part.startsWith("<")
          ? <span key={index} className="text-terracotta">{part}</span>
          : <span key={index}>{part}</span>
      )}
    </>
  );
}

export function Workspace() {
  return (
    <section id="workspace" className="scroll-mt-8 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="start"
            kicker="The workspace"
            title="A place for every concern"
            lede="Every concern gets its own top-level home, so the structure alone tells you where you are, on the first clone and three months in."
          />
          <dl className="mt-10 space-y-6">
            {POINTS.map((point) => (
              <div
                key={point.title}
                className="border-l-2 border-ochre/40 pl-4"
              >
                <dt className="font-medium text-ink">{point.title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-stone">
                  {point.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink/8 bg-parchment shadow-xl shadow-ink/5">
          <div className="flex items-center gap-1.5 border-b border-ink/8 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-terracotta/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-ochre/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-olive/70" />
            <span className="ml-auto font-mono text-xs text-stone">
              my-project
            </span>
          </div>
          <ul className="py-2 font-mono text-[13px]">
            {TREE.map((row) => {
              const RowIcon = row.path.endsWith("/") ? FolderIcon : FileIcon;
              return (
                <li
                  key={row.path}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 transition hover:bg-white/80 ${
                    row.depth === 1 ? "pl-10" : "pt-3"
                  }`}
                >
                  <RowIcon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      row.depth === 0 ? "text-ochre" : "text-olive"
                    }`}
                  />
                  <span
                    className={row.depth === 0
                      ? "font-medium text-ink"
                      : "text-ink/80"}
                  >
                    <TreePath path={row.path} />
                  </span>
                  {row.note && (
                    <span className="basis-full pl-[1.4rem] text-xs text-stone sm:ml-auto sm:basis-auto sm:pl-0">
                      {row.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
