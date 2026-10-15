import { basename } from "@std/path";

/** Thrown when a command exits non-zero. */
export class CommandFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandFailedError";
  }
}

/** Thrown when a run started before a restart can't be followed to its end: nothing of it outlived the platform. */
export class InterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterruptedError";
  }
}

/** A program to run, where, and with what process environment — nothing more of the platform's own. */
export interface Command {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Where a run's command is carried out. Each line it prints, standard output
 * and error alike, is handed on in order; a non-zero exit fails it.
 */
export interface Execution {
  /** Runs `command` as run `id`. */
  run(
    id: string,
    command: Command,
    onLine: (line: string) => void,
  ): Promise<void>;
  /** Follows run `id`, started before the platform restarted, to its end: every line it printed from the first, then how it exited. */
  rejoin(id: string, onLine: (line: string) => void): Promise<void>;
}

/** What a run whose command died with the platform fails with. */
const INTERRUPTED = "Interrupted: the platform restarted while it ran.";

/**
 * A child of the platform's own process: it ends when the platform does, so a
 * run cut off by a restart can't be rejoined. For running the platform where
 * its image isn't at hand.
 */
export class ChildProcess implements Execution {
  async run(
    _id: string,
    command: Command,
    onLine: (line: string) => void,
  ): Promise<void> {
    const child = new Deno.Command(command.program, {
      args: [...command.args],
      cwd: command.cwd,
      clearEnv: true,
      env: { ...command.env },
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
      throw new CommandFailedError(
        `${basename(command.program)} ${
          command.args[0]
        } exited with code ${code}.`,
      );
    }
  }

  rejoin(): Promise<void> {
    return Promise.reject(new InterruptedError(INTERRUPTED));
  }
}

/**
 * A container of its own, on the host's Docker daemon, from the platform's
 * own image and with the platform's data mounted where the platform has it:
 * it outlives the platform, so a run that redeploys the platform itself — or
 * any run a restart cuts across — carries on, and the platform that comes
 * back rejoins it. Its error output is folded into its standard output inside
 * the container, so what it printed reads back in the order it printed it.
 * Once its exit is read, the container is removed, and the values it ran with
 * with it.
 */
export class Container implements Execution {
  constructor(
    /** The image runs are carried out in: the platform's own, with `ens`, git and the docker CLI. */
    private readonly image: string,
    /** What each run's container mounts, as `docker run -v` takes it: the platform's data, the Docker socket, its registry logins. */
    private readonly mounts: readonly string[],
    private readonly docker = "docker",
  ) {}

  async run(
    id: string,
    command: Command,
    onLine: (line: string) => void,
  ): Promise<void> {
    await this.started(id, command);
    await this.follow(id, onLine);
  }

  async rejoin(id: string, onLine: (line: string) => void): Promise<void> {
    if (!await this.exists(id)) throw new InterruptedError(INTERRUPTED);
    await this.follow(id, onLine);
  }

  /** Starts run `id`'s container. Each value reaches it by name alone (`-e NAME`), read from the docker CLI's own environment: never on a command line. */
  private async started(id: string, command: Command): Promise<void> {
    await this.invoke(
      [
        "run",
        "--detach",
        "--name",
        nameOf(id),
        "--label",
        `ensemble.platform.run=${id}`,
        ...this.mounts.flatMap((mount) => ["--volume", mount]),
        "--workdir",
        command.cwd,
        ...Object.keys(command.env).flatMap((name) => ["--env", name]),
        "--entrypoint",
        "/bin/sh",
        this.image,
        "-c",
        'exec "$@" 2>&1',
        "sh",
        command.program,
        ...command.args,
      ],
      command.env,
    );
  }

  /** Hands on every line run `id` printed, waits for its exit, and removes its container. */
  private async follow(
    id: string,
    onLine: (line: string) => void,
  ): Promise<void> {
    const logs = new Deno.Command(this.docker, {
      args: ["logs", "--follow", nameOf(id)],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    await Promise.all([
      logs.stdout.pipeThrough(new TextDecoderStream()).pipeThrough(lines())
        .pipeTo(new WritableStream({ write: onLine })),
      logs.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(lines())
        .pipeTo(new WritableStream({ write: onLine })),
    ]);
    await logs.status;

    const code = Number((await this.invoke(["wait", nameOf(id)])).trim());
    // The run's outcome is its exit: a container that couldn't be removed is
    // reported, and doesn't turn a deploy that went well into a failure.
    await this.invoke(["rm", "--force", nameOf(id)]).catch((error) =>
      console.error(`run ${id}'s container wasn't removed:`, error)
    );
    if (code !== 0) {
      throw new CommandFailedError(`The run exited with code ${code}.`);
    }
  }

  private async exists(id: string): Promise<boolean> {
    const { code } = await new Deno.Command(this.docker, {
      args: ["container", "inspect", nameOf(id)],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  }

  private async invoke(
    args: readonly string[],
    env?: Readonly<Record<string, string>>,
  ): Promise<string> {
    const { code, stdout, stderr } = await new Deno.Command(this.docker, {
      args: [...args],
      ...(env ? { env: { ...env } } : {}),
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    const decoder = new TextDecoder();
    if (code !== 0) {
      throw new CommandFailedError(
        `docker ${args[0]} failed (${code}): ${decoder.decode(stderr).trim()}`,
      );
    }
    return decoder.decode(stdout);
  }
}

/** The container run `id` is carried out in. */
function nameOf(id: string): string {
  return `ens-run-${id}`;
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
