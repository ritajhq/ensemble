/** Runs an external command to completion, failing with its own error output. */
export class Process {
  constructor(
    private readonly command: string,
    private readonly args: readonly string[],
    private readonly options: {
      cwd?: string;
      env?: Record<string, string>;
    } = {},
  ) {}

  async run(): Promise<string> {
    const { code, stdout, stderr } = await new Deno.Command(this.command, {
      args: [...this.args],
      cwd: this.options.cwd,
      env: this.options.env,
      stdout: "piped",
      stderr: "piped",
    }).output();
    const decoder = new TextDecoder();
    if (code !== 0) {
      throw new Error(
        `${this.command} ${this.args.join(" ")} failed (${code}): ${
          decoder.decode(stderr).trim() || decoder.decode(stdout).trim()
        }`,
      );
    }
    return decoder.decode(stdout);
  }
}
