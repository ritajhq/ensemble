import { join } from "@std/path";
import { exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import type * as Lib from "./lib-context.ts";
import type { Ports } from "./ports.ts";
import { PUBLISH_SECRETS_PATH } from "./publish.ts";
import {
  type Authorization,
  authorizationFrom,
} from "./publish-authorization.ts";
import { KitFailure, KitProcess } from "./kit-process.ts";

/**
 * Invokes a named lib kit: spawns its `main.ts` with the standard lib kit
 * CLI contract (`Lib.getContext`) — the same subprocess-per-kit
 * pattern `runPack`/`runBuild` use. A concrete class rather than a port with
 * an implementation behind it: nothing in kit-sdk needs to depend on "some
 * lib kit invoker" as an injected abstraction the way deploy's classes
 * depend on `PackKitGateway`, so there's nothing yet to invert — this is
 * just how `ens` calls a lib kit.
 */
export class LibKit {
  constructor(
    private readonly kit: string,
    private readonly ports: Ports,
  ) {}

  /** Asks the kit, read-only, whether this machine may publish `input` — before anything is stamped, committed, or tagged. */
  async authorize(input: Lib.Context): Promise<Authorization> {
    const { kit, args, env } = await this.invocation("authorize", input);
    return authorizationFrom(await kit.probe("main.ts", args, { env }));
  }

  async stamp(input: Lib.Context): Promise<void> {
    await this.run(
      "stamp",
      input,
      `Stamping "${input.package}" with lib kit "${this.kit}" failed.`,
    );
  }

  async publish(input: Lib.Context): Promise<void> {
    await this.run(
      "publish",
      input,
      `Publishing "${input.package}" with lib kit "${this.kit}" failed.`,
    );
  }

  private async run(
    mode: "stamp" | "publish",
    input: Lib.Context,
    failureMessage: string,
  ): Promise<void> {
    const { kit, args, env } = await this.invocation(mode, input);
    const code = await kit.run("main.ts", args, { env });
    if (code !== 0) throw new KitFailure(failureMessage, code);
  }

  private async invocation(
    mode: "authorize" | "stamp" | "publish",
    input: Lib.Context,
  ): Promise<
    {
      kit: KitProcess;
      args: string[];
      env: Record<string, string>;
    }
  > {
    const repoRoot = await this.ports.repo.findRepoRoot();
    const kitDir = join(repoRoot, ".ensemble", "kits", "lib", this.kit);
    const kitEntry = join(kitDir, "main.ts");
    if (!await exists(kitEntry, { isFile: true })) {
      throw new Error(`Lib kit "${this.kit}" not found (expected ${kitEntry})`);
    }

    const targetArgs = input.target ? ["--target", input.target] : [];

    const args = [
      mode,
      "--lib-root",
      input.libRoot,
      "--package",
      input.package,
      "--version",
      input.version,
      ...targetArgs,
    ];
    // Registry credentials (JSR_TOKEN, …) come from the same untracked
    // secrets file pack kits publish with, through the process environment —
    // so `authorize` checks exactly the credentials `publish` will use.
    const env = await loadEnv({
      envPath: join(repoRoot, PUBLISH_SECRETS_PATH),
      export: false,
    });
    return { kit: new KitProcess(kitDir, this.ports), args, env };
  }
}
