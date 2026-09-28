/**
 * The source of a small, generic, ensemble-owned entrypoint `SubprocessKitLoader`
 * writes to a temp file *inside* a vendored deploy kit's own directory before
 * spawning `deno run` against it. Co-location is what makes this correct: a
 * dynamic `import("./main.ts")` from a file living alongside the kit's own
 * `deno.json` resolves that kit's own dependencies (verified empirically —
 * the same import from a location with no discoverable config, or from a
 * location outside the kit's own directory, resolves wrong or not at all).
 *
 * Kept as a string constant (not a real sibling `.ts` file `SubprocessKitLoader`
 * reads at runtime) so it survives being embedded in a `deno compile`d `ens`
 * binary — `deno compile` only embeds files reachable through the static
 * module graph, never a file read via `Deno.readTextFile`, even given a
 * literal path (verified empirically).
 *
 * One process serves every call `ens` makes into the kit for as long as it
 * runs (see `KitHost`), so the kit is imported once, not once per call — a
 * render makes dozens of calls, and a fresh `deno run` costs ~250ms each.
 * Requests arrive on stdin, one JSON object per line:
 * `{ id, target, method, args }`. `target` is "kit" itself, its
 * `realization()`, or `provisioners()[n]` addressed as `"provisioner:<n>"` —
 * the realization and the provisioner set are asked of the kit once and kept.
 * Requests are served concurrently, each answered on stdout as one line,
 * `RESPONSE_MARKER` followed by `{ id, ok: true, result }` or
 * `{ id, ok: false, error }`. The marker keeps a kit's own `console.log`
 * output from being mistaken for an answer: `KitHost` passes any unmarked
 * line through to stderr. The process exits when stdin closes.
 *
 * A handful of `$`-prefixed pseudo-methods exist only for this wrapper's own
 * bookkeeping, never forwarded to the real kit/provisioner object:
 * `target: "kit"`'s `$describe` (reports which optional `Kit` capabilities —
 * `watchCommand`, `emulateExternals` — this kit actually implements) and
 * `$provisionersCount` (the kit's `provisioners()` array length, so the
 * caller can build one proxy per index without ever needing the real,
 * non-serializable `Provisioner` objects to leave this process);
 * `target: "provisioner:<n>"`'s own `$describe` (reports whether that
 * specific provisioner implements the equally-optional `describe`/`provision`
 * — a real provisioner set is rarely uniform, e.g. a project-declared
 * provisioner may not implement `provision` yet while the kit's own ones do).
 *
 * `kit.present(artifacts, graph)` gets one more special case: `graph` is a
 * `DependencyGraph` *class instance* with real methods (`batches()`,
 * `dependenciesOf()`), which JSON can't carry across the process boundary —
 * `SubprocessKitLoader` sends a plain `{ batches, dependencies }` snapshot
 * instead (client-side, where the real graph is still available to query),
 * and this wrapper reconstructs a duck-typed object exposing the same two
 * methods a real kit's `present()` calls (verified against a real kit,
 * compose's own `present()` calls `graph.dependenciesOf(...)`).
 */
export const RESPONSE_MARKER = "\u001eens-kit-response ";

// No imports of its own: it runs as part of the kit, under the kit's own
// deno.json and lockfile, so anything it imported would become the kit's
// dependency too.
export const DEPLOY_KIT_WRAPPER_SOURCE = `
const RESPONSE_MARKER = ${JSON.stringify(RESPONSE_MARKER)};

interface Request {
  id: number;
  target: string;
  method: string;
  args: unknown[];
}

const mod = await import(new URL("./main.ts", import.meta.url).href);
const kit = mod.default;

let realization: Promise<any> | undefined;
let provisioners: Promise<any[]> | undefined;

function realizationOf() {
  realization ??= Promise.resolve(kit.realization());
  return realization;
}

function provisionersOf() {
  provisioners ??= Promise.resolve(kit.provisioners());
  return provisioners;
}

async function serveKit(method: string, args: any[]) {
  if (method === "$describe") {
    return {
      watchCommand: typeof kit.watchCommand === "function",
      emulateExternals: typeof kit.emulateExternals === "function",
    };
  }
  if (method === "$provisionersCount") {
    return { count: (await provisionersOf()).length };
  }
  if (method === "present") {
    const [artifacts, graphData] = args;
    const graph = {
      batches: () => graphData.batches,
      dependenciesOf: (id: any) => graphData.dependencies[id.category + "." + id.name] ?? [],
    };
    return await kit.present(artifacts, graph);
  }
  return await kit[method](...args);
}

async function serveProvisioner(index: number, method: string, args: any[]) {
  const provisioner = (await provisionersOf())[index];
  if (method === "$describe") {
    return {
      describe: typeof provisioner.describe === "function",
      provision: typeof provisioner.provision === "function",
    };
  }
  return await provisioner[method](...args);
}

async function serve(req: Request) {
  if (req.target === "kit") return await serveKit(req.method, req.args);
  if (req.target === "realization") {
    return await (await realizationOf())[req.method](...req.args);
  }
  if (req.target.startsWith("provisioner:")) {
    return await serveProvisioner(Number(req.target.split(":")[1]), req.method, req.args);
  }
  throw new Error("Unknown target: " + req.target);
}

const encoder = new TextEncoder();

// Synchronous, so one answer's bytes never interleave with another's; looped,
// since a pipe may take fewer bytes than it is given.
function answer(response: unknown) {
  let bytes = encoder.encode(RESPONSE_MARKER + JSON.stringify(response) + "\\n");
  while (bytes.length > 0) bytes = bytes.subarray(Deno.stdout.writeSync(bytes));
}

function handle(line: string) {
  if (line.trim() === "") return;
  const req: Request = JSON.parse(line);
  serve(req).then(
    (result) => answer({ id: req.id, ok: true, result: result ?? null }),
    (error) => answer({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
}

let pending = "";
for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
  pending += chunk;
  let newline = pending.indexOf("\\n");
  while (newline !== -1) {
    handle(pending.slice(0, newline));
    pending = pending.slice(newline + 1);
    newline = pending.indexOf("\\n");
  }
}
handle(pending);
`;
