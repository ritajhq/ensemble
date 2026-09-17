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
 * Reads one `{ target, method, args }` JSON request from stdin, resolves
 * `target` against the freshly-imported kit ("kit" itself, its `realization()`,
 * or `provisioners()[n]` addressed as `"provisioner:<n>"`), calls `method`
 * with `args`, and prints the JSON result to stdout — one request per process,
 * matching the one-shot spawn-per-call convention every other lib/build/pack
 * kit subprocess already uses (exit 0 + stdout JSON = success, nonzero exit +
 * stderr = failure). A handful of `$`-prefixed pseudo-methods exist only for
 * this wrapper's own bookkeeping, never forwarded to the real kit/provisioner
 * object: `target: "kit"`'s `$describe` (reports which optional `Kit`
 * capabilities — `watchCommand`, `emulateExternals` — this kit actually
 * implements) and `$provisionersCount` (the kit's `provisioners()` array
 * length, so the caller can build one proxy per index without ever needing
 * the real, non-serializable `Provisioner` objects to leave this process);
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
export const DEPLOY_KIT_WRAPPER_SOURCE = `
interface Request {
  target: string;
  method: string;
  args: unknown[];
}

async function main() {
  const input = await new Response(Deno.stdin.readable).text();
  const req: Request = JSON.parse(input);

  const mod = await import(new URL("./main.ts", import.meta.url).href);
  const kit = mod.default;

  if (req.target === "kit" && req.method === "$describe") {
    console.log(JSON.stringify({
      watchCommand: typeof kit.watchCommand === "function",
      emulateExternals: typeof kit.emulateExternals === "function",
    }));
    return;
  }

  if (req.target === "kit" && req.method === "$provisionersCount") {
    const provisioners = await kit.provisioners();
    console.log(JSON.stringify({ count: provisioners.length }));
    return;
  }

  if (req.target === "kit" && req.method === "present") {
    const [artifacts, graphData] = req.args;
    const graph = {
      batches: () => graphData.batches,
      dependenciesOf: (id) => graphData.dependencies[id.category + "." + id.name] ?? [],
    };
    const result = await kit.present(artifacts, graph);
    console.log(JSON.stringify(result ?? null));
    return;
  }

  if (req.target === "kit") {
    const result = await kit[req.method](...req.args);
    console.log(JSON.stringify(result ?? null));
    return;
  }

  if (req.target === "realization") {
    const realization = await kit.realization();
    const result = await realization[req.method](...req.args);
    console.log(JSON.stringify(result ?? null));
    return;
  }

  if (req.target.startsWith("provisioner:")) {
    const index = Number(req.target.split(":")[1]);
    const provisioners = await kit.provisioners();
    const provisioner = provisioners[index];

    if (req.method === "$describe") {
      console.log(JSON.stringify({
        describe: typeof provisioner.describe === "function",
        provision: typeof provisioner.provision === "function",
      }));
      return;
    }

    const result = await provisioner[req.method](...req.args);
    console.log(JSON.stringify(result ?? null));
    return;
  }

  throw new Error("Unknown target: " + req.target);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
});
`;
