import type { ComponentType } from "react";
import { AwsMark, CloudflareMark, DockerMark } from "./BrandMark.tsx";
import { SectionHeading } from "./section-heading.tsx";

const MANIFEST = `# what the workload is, not how to run it
release:
  api:
    kit: docker

deploy:
  compute:
    server:
      type: container
      image: \${release.api}
      env:
        DATABASE_HOST: \${databases.db.host}
  databases:
    db:
      type: relational
  storage:
    uploads:
      type: object-storage`;

/** Colors one manifest line: comments, keys, references and plain values. */
function ManifestLine({ line }: { line: string }) {
  if (line.trimStart().startsWith("#")) {
    return <div className="text-stone italic">{line}</div>;
  }
  const match = line.match(/^(\s*[\w-]+:)(.*)$/);
  if (!match) return <div>{line || " "}</div>;
  const [, key, value] = match;
  const isRef = value.includes("${");
  return (
    <div>
      <span className="text-aegean-deep">{key}</span>
      <span className={isRef ? "text-terracotta" : "text-olive"}>{value}</span>
    </div>
  );
}

interface Stage {
  name: string;
  kit: string;
  where: string;
  mark?: ComponentType<{ className?: string }>;
  performs: string[];
}

/** Where a workload can be performed today, and what each kit plays its parts with. */
const STAGES: Stage[] = [
  {
    name: "Docker Compose",
    kit: "compose",
    where: "your laptop or a bare-metal box",
    mark: DockerMark,
    performs: ["containers", "PostgreSQL", "Garage S3", "Caddy"],
  },
  {
    name: "AWS",
    kit: "aws",
    where: "managed services in your account",
    mark: AwsMark,
    performs: ["ECS", "Lambda", "RDS", "DynamoDB", "S3", "CloudFront"],
  },
  {
    name: "Cloudflare",
    kit: "cloudflare",
    where: "the edge, with nothing to keep running",
    mark: CloudflareMark,
    performs: ["Workers", "D1", "R2"],
  },
];

const CUES = [
  {
    command: "ens develop shop",
    verb: "Rehearse",
    body: "locally, syncing your edits into the running stack",
  },
  {
    command: "ens deploy shop aws",
    verb: "Perform",
    body: "for real, reconciled to what the score declares",
  },
];

export function Stages() {
  return (
    <section id="stages" className="scroll-mt-8 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          kicker="Delivery"
          title="One score, many stages"
          lede="A delivery manifest says what your workload is: its compute, databases, storage and routes. The deploy kit you point it at decides what each part becomes."
        />

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-ink/8 bg-white/80 shadow-xl shadow-ink/5">
              <div className="border-b border-ink/8 px-5 py-3 font-mono text-xs text-stone">
                ci/shop/delivery.yml
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-ink">
                {MANIFEST.split("\n").map((line, index) => (
                  <ManifestLine key={index} line={line} />
                ))}
              </pre>
            </div>
          </div>

          <ul className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 lg:col-span-3">
            {STAGES.map(({ mark: Mark, ...stage }) => (
              <li
                key={stage.kit}
                className="rounded-2xl border border-ink/8 bg-white/70 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg text-ink">
                      {stage.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-stone">{stage.where}</p>
                  </div>
                  {Mark && <Mark className="h-7 w-7 shrink-0" />}
                </div>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {stage.performs.map((service) => (
                    <li
                      key={service}
                      className="rounded-full bg-marble px-2.5 py-1 text-xs text-ink/80"
                    >
                      {service}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 font-mono text-[11px] text-stone">
                  kit: {stage.kit}
                </p>
              </li>
            ))}
            <li className="flex flex-col justify-center rounded-2xl border border-dashed border-ochre/50 p-5">
              <h3 className="font-serif text-lg text-ink">Your stage</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone">
                Kubernetes, Fly, a box in the closet. A deploy kit reads the
                score and provisions it; write one and every workload can play
                there.
              </p>
            </li>
          </ul>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CUES.map((cue) => (
            <li
              key={cue.command}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl bg-marble/70 px-5 py-4"
            >
              <span className="font-serif text-xl text-ink">{cue.verb}</span>
              <span className="text-sm text-stone">{cue.body}</span>
              <code className="basis-full font-mono text-xs text-aegean">
                $ {cue.command}
              </code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
