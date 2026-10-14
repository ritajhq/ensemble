import { dirname, join } from "@std/path";
import type * as Deploy from "./deploy/index.ts";

/** One of the deployment's ingresses, its alias now named. */
export interface RecordedIngress extends Deploy.Render.Ingress {
  readonly alias: string;
}

/**
 * Where the last deploy of a workload with one kit can be reached from a
 * shared network: the render's `Ingress`es, each with the alias it actually
 * took — the deployment's own name, unless the manifest chose one. What a
 * router fronting several deployments reads to learn where each answers,
 * instead of every manifest agreeing on a naming convention with it.
 */
export interface IngressRecord {
  readonly version: 1;
  readonly deployment: string;
  readonly ingresses: readonly RecordedIngress[];
}

/**
 * Where a workload's ingress record for one kit is kept:
 * `.ensemble/deploy/<workload>/<kit>.ingress.json`, beside its task snapshot,
 * and like it never committed — the alias depends on the checkout and the
 * instance, not on the manifest. A missing or unreadable file is no record.
 */
export class IngressFile {
  constructor(private readonly path: string) {}

  static for(repoRoot: string, name: string, kit: string): IngressFile {
    return new IngressFile(
      join(repoRoot, ".ensemble", "deploy", name, `${kit}.ingress.json`),
    );
  }

  async read(): Promise<IngressRecord | undefined> {
    try {
      const record = JSON.parse(await Deno.readTextFile(this.path));
      return record?.version === 1 ? record : undefined;
    } catch {
      return undefined;
    }
  }

  async write(record: IngressRecord): Promise<void> {
    await Deno.mkdir(dirname(this.path), { recursive: true });
    await Deno.writeTextFile(this.path, JSON.stringify(record, null, 2));
  }
}

/** Keeps an `IngressRecord` once a deployment is up (`Deploy.Terminations.DeployedState`), even an empty one: a deployment that no longer joins any network says so. */
export class IngressRecorder implements Deploy.Terminations.DeployedState {
  constructor(
    private readonly file: IngressFile,
    private readonly deployment: string,
  ) {}

  async record(
    _ledger: Deploy.Render.OutputsLedger,
    _artifactPath: string,
    artifacts: Deploy.Render.Artifacts,
  ): Promise<void> {
    await this.file.write({
      version: 1,
      deployment: this.deployment,
      ingresses: (artifacts.ingresses ?? []).map((ingress) => ({
        ...ingress,
        alias: ingress.alias ?? this.deployment,
      })),
    });
  }
}
