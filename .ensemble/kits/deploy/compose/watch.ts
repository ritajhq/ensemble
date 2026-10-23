import { parse as parseYaml } from "@std/yaml";
import { LocalProxy } from "./provisioners/local-proxy.ts";

// The compose kit's watch (see main.ts's `watchCommand`), what `ens develop`
// runs: the stack's gateways are put behind the shared local proxy, then
// compose's own watch takes over for as long as the session lasts. The proxy
// is the host's entrypoint a real host gets from its own gateway or tunnel,
// so it belongs to developing, never to the render or to an apply, and `ens
// develop --no-runtime` (or `development.runtime: false` in config.yaml)
// leaves it alone.
//
// Usage: watch.ts <compose file> -- <the docker compose watch command>

const [artifactPath, separator, ...watch] = Deno.args;
if (separator !== "--" || watch.length === 0) {
  console.error("Usage: watch.ts <compose file> -- <watch command>");
  Deno.exit(2);
}

const proxy = LocalProxy.of(
  parseYaml(await Deno.readTextFile(artifactPath)) as {
    services?: Record<string, unknown>;
  },
);
if (proxy.isNeeded && Deno.env.get("ENSEMBLE_START_RUNTIME") === "true") {
  const started = await new Deno.Command("sh", {
    args: ["-c", proxy.startScript()],
    stdout: "null",
  }).spawn().status;
  if (!started.success) {
    console.error("Could not start the local proxy (ens-local-proxy).");
    Deno.exit(started.code);
  }
}

const [command, ...args] = watch;
const { code } = await new Deno.Command(command, { args }).spawn().status;
Deno.exit(code);
