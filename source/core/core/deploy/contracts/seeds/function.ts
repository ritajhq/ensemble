import { ResourceContract } from "../contract.ts";

/**
 * `function.v1` — a compute entry that runs on demand rather than as a
 * long-lived process: code invoked per request (or event) by the target,
 * scaled and billed by invocation. The serverless counterpart of
 * `container-orchestrated.v1`.
 *
 * `code` is where the deployable bundle lives — always a `${release.<name>}`
 * reference, resolved by that release's pack kit to a local path or a
 * published location (an S3 URL for the `function` pack kit); a kit realizes
 * either. The bundle is a directory of ES modules whose `main.js`
 * default-exports `{ fetch(request, env) }`, the Fetch API's own handler
 * shape — a `Request` in, a `Response` out — with `env` the function's
 * environment; a kit owns whatever adapts its platform's invocation to that
 * shape, and documents what its `env` holds, so no platform's handler
 * convention reaches the manifest. An app wired for several platforms packs
 * one bundle per integration (`source/integrations/<kit>/<app>`, see
 * `../../integration.ts`), and the kit deploying gets its own; one with no
 * integrations is its own bundle, whichever kit deploys it.
 * `runtime` names the language runtime when the target needs one named (a
 * kit-defined default otherwise). `env` is the function's environment, the
 * same shape as `container-orchestrated.v1`'s.
 *
 * `tables` lists the `key-value` tables the function reads and writes, as
 * `${databases.<name>.name}` references, and `buckets` the `object-storage`
 * buckets it reads and writes objects in, as `${storage.<name>.bucket}`
 * references — what the function is granted, and nothing broader: item
 * access to those tables, object reads, writes, deletes and listing in those
 * buckets. A function reaches each by name, passed in `env` too. A kit whose
 * platform hands a function its resources as runtime objects rather than
 * addresses (Workers bindings) puts each one in `env` under that same name,
 * so the code finds a table or bucket the same way everywhere: by the name
 * `env` gave it.
 *
 * `development` is the same developer-owned block `container-orchestrated.v1`
 * takes (`../../development.ts`), checked here only as an object: under `ens
 * develop`, its `sync` rules keep the function's code current with an app's
 * build output (`path` being where that output lands inside the function's
 * package), and its `env` adds variables, as for a container.
 *
 * Exposed over HTTP by naming it as a `gateway.v1` route target
 * (`target: { service: <name> }`), never on its own: the gateway owns
 * ingress, same as for a container.
 */
export const functionV1: ResourceContract = new ResourceContract(
  "compute",
  "function",
  "v1",
  [
    { name: "code", required: true, type: "string" },
    { name: "runtime", required: false, type: "string" },
    { name: "env", required: false, type: "object" },
    { name: "tables", required: false, type: "array" },
    { name: "buckets", required: false, type: "array" },
    { name: "development", required: false, type: "object" },
  ],
  [],
  [],
  ["name"],
);
