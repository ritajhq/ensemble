/** What a concealed value reads as in a failure's message. */
const MASK = "••••";

/** Runs an external command to completion, failing with its own error output. */
export class Process {
  constructor(
    private readonly command: string,
    private readonly args: readonly string[],
    private readonly options: {
      cwd?: string;
      env?: Record<string, string>;
      /** Values never to repeat in a failure's message, though the command line or its output holds them: a token passed as an argument. */
      concealed?: readonly string[];
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
        this.conceal(
          `${this.command} ${this.args.join(" ")} failed (${code}): ${
            decoder.decode(stderr).trim() || decoder.decode(stdout).trim()
          }`,
        ),
      );
    }
    return decoder.decode(stdout);
  }

  private conceal(message: string): string {
    return (this.options.concealed ?? [])
      .filter((value) => value.length > 0)
      .reduce((text, value) => text.replaceAll(value, MASK), message);
  }
}
