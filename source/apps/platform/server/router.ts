import { dirname } from "@std/path";
import { Delegate, type Emitter } from "@duesabati/evento";
import * as Platform from "@ensemble/platform";
import { Caddyfile, type Protection } from "./caddyfile.ts";
import type * as Kv from "./kv.ts";

/**
 * The platform's router, as the platform tells it what to route: every
 * deployment's recorded ingresses, kept, and the routing table they make
 * written out as the router's configuration, which the router reloads by
 * itself (`caddy run --watch`). Nothing reaches the router to configure it:
 * the file is in a volume only the platform and the router share.
 */
export class Router {
  private readonly published = new Delegate<[Platform.RoutingTable]>();
  private turn: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ingresses: Kv.Ingresses,
    /** Where the router reads its Caddyfile. */
    private readonly configuration: string,
    /** What the platform answers for itself — its own UI, behind whatever protects it — beside every deployment. */
    private readonly own: readonly Platform.Ingresses[] = [],
    /** How what it routes is protected: the guard previews pass, the platform's cookie kept from deployments. */
    private readonly protection: Protection = {},
  ) {}

  /** The routing table was rebuilt and handed to the router. */
  get OnPublished(): Emitter<[Platform.RoutingTable]> {
    return this.published;
  }

  /** `owner` is up, answering where its ingresses say: whatever it answered for before, it now answers for this. */
  answering(
    owner: string,
    ingresses: Platform.Ingresses["ingresses"],
  ): Promise<void> {
    return this.inTurn(async () => {
      await this.ingresses.save({ owner, ingresses });
      await this.write();
    });
  }

  /** `owner` was taken down: nothing is routed to it any more. */
  withdraw(owner: string): Promise<void> {
    return this.inTurn(async () => {
      await this.ingresses.remove(owner);
      await this.write();
    });
  }

  /** Hand the router the table as it stands: at start, before anything is deployed again. */
  publish(): Promise<void> {
    return this.inTurn(() => this.write());
  }

  async table(): Promise<Platform.RoutingTable> {
    return Platform.RoutingTable.of(await this.ingresses.all(), this.own);
  }

  /** One rebuild at a time, so a slower one never overwrites a newer table. */
  private inTurn(work: () => Promise<void>): Promise<void> {
    const next = this.turn.then(work, work);
    this.turn = next;
    return next;
  }

  private async write(): Promise<void> {
    const table = await this.table();
    await Deno.mkdir(dirname(this.configuration), { recursive: true });
    // Written whole, then moved over the old one, so the router never reads
    // half a configuration.
    const draft = `${this.configuration}.next`;
    await Deno.writeTextFile(
      draft,
      new Caddyfile(table, this.protection).text(),
    );
    await Deno.rename(draft, this.configuration);
    this.published.Invoke(table);
  }
}
