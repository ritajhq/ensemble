import type * as Platform from "@ensemble/platform";

/** Thrown when `ens` exits non-zero. */
export class CommandFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandFailedError";
  }
}

/**
 * What `ens` and the kits it runs may see of the platform's own environment:
 * where programs and the Docker daemon are, and nothing else. The platform's
 * secret key and GitHub token stay its own.
 */
const PASSTHROUGH = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "TMPDIR",
  "XDG_RUNTIME_DIR",
  "DENO_DIR",
  "DOCKER_HOST",
  "DOCKER_CONFIG",
] as const;

/** What each termination adds to `ens deploy`. */
const TERMINATION_FLAGS: Readonly<
  Record<Platform.Termination, readonly string[]>
> = {
  plan: ["--plan"],
  apply: [],
};

/** Who a release's commits and tags are made as, and what pushes them. */
export interface Releaser {
  readonly name: string;
  readonly email: string;
  /** Pushes to GitHub; sent as a header through git's own environment configuration, never written into the checkout. */
  readonly token?: string;
}

/**
 * The `ens` CLI, run in a project's checkout. An environment's values, and a
 * project's release credentials, reach it the way they reach `ens` in any
 * pipeline: through its process environment.
 */
export class Ensemble {
  constructor(
    private readonly binary: string,
    private readonly releaser: Releaser,
    private readonly host: Deno.Env = Deno.env,
  ) {}

  /** Runs `ens deploy` for `deployment`, handing each line it prints to `onLine`. */
  async deploy(
    deployment: Platform.Deployment,
    checkout: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    await this.run(
      [
        "deploy",
        deployment.manifest,
        deployment.kit,
        "--artifacts",
        "published",
        "--version",
        deployment.version,
        ...(deployment.instance ? ["--instance", deployment.instance] : []),
        ...TERMINATION_FLAGS[deployment.termination],
      ],
      checkout,
      values,
      onLine,
    );
  }

  /**
   * Runs `ens release` for `release`, answering yes to each of its
   * questions, with `credentials` for its publishes and the releaser's
   * identity and token for the commits and tag it pushes.
   */
  async release(
    release: Platform.Release,
    checkout: string,
    credentials: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    await this.run(
      ["release", release.action, release.argument, "--yes"],
      checkout,
      { ...credentials, ...this.gitEnvironment() },
      onLine,
    );
  }

  /** git's identity, and its GitHub authorization as environment-supplied configuration (`GIT_CONFIG_COUNT`). */
  private gitEnvironment(): Record<string, string> {
    const { name, email, token } = this.releaser;
    const identity = {
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    };
    if (!token) return identity;
    return {
      ...identity,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${
        btoa(`x-access-token:${token}`)
      }`,
    };
  }

  private async run(
    args: readonly string[],
    cwd: string,
    values: Readonly<Record<string, string>>,
    onLine: (line: string) => void,
  ): Promise<void> {
    const child = new Deno.Command(this.binary, {
      args: [...args],
      cwd,
      clearEnv: true,
      env: { ...this.passedThrough(), ...values, NO_COLOR: "1" },
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    await Promise.all([
      child.stdout.pipeThrough(new TextDecoderStream()).pipeThrough(lines())
        .pipeTo(new WritableStream({ write: onLine })),
      child.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(lines())
        .pipeTo(new WritableStream({ write: onLine })),
    ]);
    const { code } = await child.status;
    if (code !== 0) {
      throw new CommandFailedError(`ens ${args[0]} exited with code ${code}.`);
    }
  }

  private passedThrough(): Record<string, string> {
    return Object.fromEntries(
      PASSTHROUGH.flatMap((name) => {
        const value = this.host.get(name);
        return value === undefined ? [] : [[name, value]];
      }),
    );
  }
}

/** Text split into lines, without their line breaks; a last line with none is kept too. */
function lines(): TransformStream<string, string> {
  let pending = "";
  return new TransformStream({
    transform(chunk, controller) {
      const parts = (pending + chunk).split(/\r?\n/);
      pending = parts.pop() ?? "";
      for (const part of parts) controller.enqueue(part);
    },
    flush(controller) {
      if (pending) controller.enqueue(pending);
    },
  });
}
