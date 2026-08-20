/**
 * Subprocess entrypoint for `script:` steps. Spawned as
 * `deno run -A <this-file> <user-script-path> <result-handle>` (see
 * run-step.ts). Reads the step's StepContext as JSON from stdin, dynamically
 * imports the user's script module, calls its exported `run(ctx)`, and
 * writes the returned outputs (or nothing, for a void return) to the given
 * result handle — NOT stdout, which stays free for the script's own
 * console.log/console.error, exactly like an in-process step. `result-handle`
 * is opaque here — it's whatever the parent's ResultChannel implementation
 * (result-channel.ts) produced; today that's a temp file path, written via
 * Deno.writeTextFile.
 *
 * This file's SOURCE (not this file itself) is read via `Deno.readTextFile`
 * by run-step.ts (against this file's own `import.meta.url`, not a `{ type:
 * "text" }` import — JSR's module graph builder rejects that attribute),
 * then materialized to a real temp file at runtime before each script step —
 * this is what keeps script: steps resolvable even from a `deno compile`d
 * `ens` binary, whose own `import.meta.url` doesn't point to a real on-disk
 * path. The root deno.json's "compile" task must `--include` this file so
 * it's embedded in the compiled binary too.
 */

async function readStdin(): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of Deno.stdin.readable) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function isOutputRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
}

const [scriptPath, resultHandle] = Deno.args;
if (!scriptPath || !resultHandle) {
  console.error("run-script-subprocess: missing script path or result handle argument.");
  Deno.exit(1);
}

try {
  const ctx = JSON.parse(await readStdin());
  const mod = await import(`file://${scriptPath}`);

  if (typeof mod.run !== "function") {
    console.error(`Script "${scriptPath}" must export a run(ctx) function.`);
    Deno.exit(1);
  }

  const outputs = await mod.run(ctx);
  if (outputs === undefined) {
    Deno.exit(0);
  }
  if (!isOutputRecord(outputs)) {
    console.error(`Script "${scriptPath}"'s run() must return Record<string,string> or void.`);
    Deno.exit(1);
  }
  await Deno.writeTextFile(resultHandle, JSON.stringify(outputs));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  Deno.exit(1);
}
