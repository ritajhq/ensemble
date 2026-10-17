import { $ } from "@david/dax";
import { resolveDenoExecutable } from "@ensemble/kit-sdk";

/** Microsoft's extension packaging tool, run through Deno's npm support so the project needs no Node toolchain. */
export class Vsce {
  private constructor(private readonly denoExe: string) {}

  static async resolve(): Promise<Vsce> {
    return new Vsce(await resolveDenoExecutable());
  }

  /** Packages the unpacked extension folder `extension` into the .vsix file at `output`. */
  async package(extension: string, output: string): Promise<number> {
    const result = await this.run(extension, ["package", "--out", output]);
    return result.code;
  }

  /** Publishes the unpacked extension folder `extension`; authenticates with VSCE_PAT from the environment. A version already on the Marketplace counts as published, so `ens release resume` can rerun it. */
  async publish(extension: string): Promise<number> {
    const result = await this.run(extension, ["publish", "--skip-duplicate"]);
    return result.code;
  }

  /** Checks that VSCE_PAT has publish rights for `publisher`, without publishing anything — the reason vsce gives when it hasn't. */
  async verifyPublisher(publisher: string): Promise<void> {
    const result =
      await $`${this.denoExe} run -A --no-lock npm:@vscode/vsce@3.9.2 verify-pat ${publisher}`
        .stdout("piped")
        .stderr("piped")
        .noThrow();
    if (result.code === 0) return;
    throw new Error(
      `VSCE_PAT can't publish as Marketplace publisher "${publisher}" — ${
        result.stderr.trim() || result.stdout.trim() ||
        `vsce exited with code ${result.code}`
      }`,
    );
  }

  // The bundle is self-contained, so there are no node_modules to collect, and
  // repository/license are optional metadata vsce would otherwise prompt for.
  private run(extension: string, args: string[]) {
    return $`${this.denoExe} run -A npm:@vscode/vsce@3.9.2 ${args} --no-dependencies --allow-missing-repository --skip-license`
      .cwd(extension)
      .noThrow();
  }
}
