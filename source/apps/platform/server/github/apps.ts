import type { Sealed, Vault } from "../vault.ts";
import { App } from "./app.ts";

/** How long a setup begun on GitHub may take to come back. */
const SETUP_LIFETIME_MS = 60 * 60 * 1000;

/** What is kept of the app: its secrets sealed, the rest as GitHub gave it. */
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
 * Where the platform keeps its GitHub App — one at most — with its private
 * key and webhook secret sealed, and the setups begun on GitHub that haven't
 * come back yet.
 */
export class Apps {
  constructor(private readonly kv: Deno.Kv, private readonly vault: Vault) {}

  async get(): Promise<App | undefined> {
    const { value } = await this.kv.get<AppRecord>(["github-app"]);
    if (!value) return undefined;
    return App.of({
      ...value,
      privateKey: await this.vault.open(value.privateKey, CONTEXT.privateKey),
      webhookSecret: await this.vault.open(
        value.webhookSecret,
        CONTEXT.webhookSecret,
      ),
    });
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
    await this.kv.set(["github-app"], record);
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
}

/** What each sealed secret is bound to: one never opens as the other. */
const CONTEXT = {
  privateKey: ["github-app", "private-key"],
  webhookSecret: ["github-app", "webhook-secret"],
} as const;
