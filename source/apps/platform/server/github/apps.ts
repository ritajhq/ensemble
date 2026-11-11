import type { Sealed, Vault } from "../vault.ts";
import { App } from "./app.ts";

/** How long a setup begun on GitHub may take to come back. */
const SETUP_LIFETIME_MS = 60 * 60 * 1000;

/** Where each app is kept, by its id. */
const APPS = ["github-apps"];

/** Where the one app was kept before the platform could have several: moved under `APPS` when first read. */
const SINGLE_APP = ["github-app"];

/** What is kept of an app: its secrets sealed, the rest as GitHub gave it. */
interface AppRecord {
  readonly id: number;
  readonly slug: string;
  readonly owner: string;
  readonly htmlUrl: string;
  readonly botId: number;
  readonly privateKey: Sealed;
  readonly webhookSecret: Sealed;
}

/**
 * Where the platform keeps its GitHub Apps — one per account it was set up
 * under, since a private app can only be installed on its owner's
 * repositories — with their private keys and webhook secrets sealed, and the
 * setups begun on GitHub that haven't come back yet.
 */
export class Apps {
  constructor(private readonly kv: Deno.Kv, private readonly vault: Vault) {}

  /** Every app, in the order of their ids: the first set up first. */
  async list(): Promise<App[]> {
    await this.moveSingleApp();
    const apps: App[] = [];
    for await (const { value } of this.kv.list<AppRecord>({ prefix: APPS })) {
      apps.push(await this.opened(value));
    }
    return apps;
  }

  async find(id: number): Promise<App | undefined> {
    await this.moveSingleApp();
    const { value } = await this.kv.get<AppRecord>([...APPS, id]);
    return value ? await this.opened(value) : undefined;
  }

  async save(app: App): Promise<void> {
    const { privateKey, webhookSecret, ...rest } = app.record;
    const record: AppRecord = {
      ...rest,
      privateKey: await this.vault.seal(privateKey, CONTEXT.privateKey),
      webhookSecret: await this.vault.seal(
        webhookSecret,
        CONTEXT.webhookSecret,
      ),
    };
    await this.kv.set([...APPS, app.id], record);
  }

  /** Remembers a setup sent to GitHub under `state`, for an hour. */
  async expect(state: string): Promise<void> {
    await this.kv.set(["github-app-setups", state], true, {
      expireIn: SETUP_LIFETIME_MS,
    });
  }

  /** Whether `state` names a setup this platform sent, forgetting it: each comes back once. */
  async awaited(state: string): Promise<boolean> {
    const key = ["github-app-setups", state];
    const { value, versionstamp } = await this.kv.get<boolean>(key);
    if (!value) return false;
    const { ok } = await this.kv.atomic().check({ key, versionstamp }).delete(
      key,
    ).commit();
    return ok;
  }

  /** The app kept before the platform could have several, moved where the others are; its secrets stay sealed as they were. */
  private async moveSingleApp(): Promise<void> {
    const single = await this.kv.get<AppRecord>(SINGLE_APP);
    if (!single.value) return;
    await this.kv.atomic()
      .check(single)
      .set([...APPS, single.value.id], single.value)
      .delete(SINGLE_APP)
      .commit();
  }

  private async opened(record: AppRecord): Promise<App> {
    return App.of({
      ...record,
      privateKey: await this.vault.open(record.privateKey, CONTEXT.privateKey),
      webhookSecret: await this.vault.open(
        record.webhookSecret,
        CONTEXT.webhookSecret,
      ),
    });
  }
}

/** What each sealed secret is bound to: one never opens as the other. */
const CONTEXT = {
  privateKey: ["github-app", "private-key"],
  webhookSecret: ["github-app", "webhook-secret"],
} as const;
