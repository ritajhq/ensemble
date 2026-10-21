# Resources and engines

A workload needs a database, a bucket, a queue. Almost always the _kind_ is what
matters and the _brand_ doesn't: "a key-value table", not "DynamoDB". Ensemble
models that split directly. Think of ordering a taxi versus ordering a Toyota:
the manifest asks for the standard thing, any fleet can answer, and naming the
brand is allowed — but then only fleets that run that brand can take the job,
and the manifest says so out loud.

![What a deploy runs for an app: explicit steps in green, conventions in amber](../../assets/ens-integrations.svg)

## Two ways to ask

A resource declares a portable **type** (`key-value`, `object-storage`,
`relational`). The technology that holds it is its **engine**, and the manifest
can leave that to the deploy kit or choose it:

```yaml
deploy:
  databases:
    experiences:
      type: key-value # no engine: whatever the kit provides
      keySchema: { partition: PK, sort: SK }

    ledger:
      type: relational
      engine: postgres # a pin: Postgres, on purpose
      version: "16"
      user: ledger
      database: ledger
      passwordSecret: ledger-password
```

Leaving `engine` out is the portable choice: the same manifest deploys wherever
some kit can provide the type. Writing it is a deliberate one: you get that
technology's full feature set, and the manifest is deployable only where a kit
provides it. The price is never implicit.

| Type             | `aws`                                    | `cloudflare` | `compose`  |
| ---------------- | ---------------------------------------- | ------------ | ---------- |
| `key-value`      | `dynamodb` (default)                     | `d1`         | —          |
| `object-storage` | `s3`                                     | `r2`         | `garage`   |
| `relational`     | `postgres` (default), `mysql`, `mariadb` | —            | `postgres` |

An engine is a plain string the contract carries (`engine` is an optional param
of `key-value.v1`, `object-storage.v1` and `relational.v1`) and a deploy kit
declares the ones it provides; core never hard-codes a technology.

## Who decides what

| Decision                                     | Whose it is                               | Where                                                                       |
| -------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| The type, and a pin if one is wanted         | the developer                             | the resource in `ci/<name>/delivery.yml`                                    |
| Which engines exist for a type on a platform | the kit                                   | its realization (`enginesFor`)                                              |
| The engine a type gets when nobody pins      | the kit, overridable by the platform team | the kit's `defaultFor`, then `targetValues` in `ci/<name>/<kit>.config.yml` |

An engine is resolved the way every negotiated value is, first match winning:
the developer's **pin**, then the resource's `class` preset, then the platform
default. Whatever comes out must be one the kit provides, or resolution stops
with an error naming what it does provide — for a pin, and for a default a
platform's own config set to something the kit can't deliver.

A platform team changes what unpinned resources get without touching any
manifest:

```yaml
# ci/flowed/aws.config.yml
targetValues:
  databases.relational:
    defaults:
      engine: mysql
```

Developers never see that file; they see only what their manifest says and what
the deployment tells them (below).

## Seeing the price

**At deploy time**, asking a kit for an engine it doesn't provide fails before
anything is rendered:

```text
error: databases.experiences: engine "d1" isn't one this kit provides for
key-value (it provides: dynamodb). Remove the pin to take what the kit
provides, or deploy with a kit that provides d1.
```

**Before deploying**, `ens deploy targets <name>` asks every installed deploy
kit whether it can deploy the manifest, resolving only — nothing is rendered,
and no secret is needed:

```text
flowed:
  ✓ aws — storage.editor-site on s3, storage.files on s3, databases.experiences on dynamodb
  ✓ cloudflare — storage.editor-site on r2, storage.files on r2, databases.experiences on d1
  ✗ compose — No provisioner matches compute.api (type "function").
Runs on: aws, cloudflare. Nothing is pinned.
```

Pin `experiences` to `dynamodb` and the answer narrows, with the reason beside
the kit it excludes:

```text
  ✓ aws — … databases.experiences on dynamodb (pinned)
  ✗ cloudflare — databases.experiences: engine "dynamodb" isn't one this kit provides …
Runs on: aws. Pinned: databases.experiences → dynamodb.
```

`ens deploy <name> <kit> explain <resource>` shows the engine's provenance
(`pin`, `preset`, `default`) like any other negotiated value.

## What a function is told

A manifest says what a resource is; the code running next to it shouldn't have
to say it again, or guess. So a `function` is **described** the resources it's
granted — the `tables` and `buckets` it lists — in its own environment. Core
adds the description before any kit sees the request, so every kit renders it as
it renders any other reference.

```text
ENSEMBLE_RESOURCES=experiences,files
ENSEMBLE_RESOURCE_EXPERIENCES_TYPE=key-value
ENSEMBLE_RESOURCE_EXPERIENCES_ENGINE=dynamodb
ENSEMBLE_RESOURCE_EXPERIENCES_NAME=experiences
ENSEMBLE_RESOURCE_EXPERIENCES_PARTITION=PK
ENSEMBLE_RESOURCE_EXPERIENCES_SORT=SK
ENSEMBLE_RESOURCE_FILES_TYPE=object-storage
ENSEMBLE_RESOURCE_FILES_ENGINE=s3
ENSEMBLE_RESOURCE_FILES_URL=…
ENSEMBLE_RESOURCE_FILES_PUBLIC_URL=…
ENSEMBLE_RESOURCE_FILES_BUCKET=flowed-files
```

The convention is small and plain:

- `ENSEMBLE_RESOURCES` lists the granted names, comma-separated.
- `ENSEMBLE_RESOURCE_<NAME>_TYPE` is the contract's type, and there is one
  `ENSEMBLE_RESOURCE_<NAME>_<OUTPUT>` per output the contract declares (`engine`
  among them), each holding that output's value for this deployment — a baked
  value, or the target's own wiring where the value only exists once deployed.
- `<NAME>` is the resource's name uppercased with every run of other characters
  one underscore (`editor-site` → `EDITOR_SITE`), and `<OUTPUT>` its camelCase
  name in upper snake case (`publicUrl` → `PUBLIC_URL`). Two names that collide,
  or an `env` entry that already uses a name, are errors at render time.
- A variable belongs to the longest resource name it starts with, so `files` and
  `files-extra` can both be described.

The outputs come from the contract, so every kit provides the same set. Core
fills the ones that follow from the manifest alone: `engine` (negotiated), and a
key-value table's `partition` and `sort` (from `keySchema`; empty without a sort
key). A kit never produces them, and can't get them wrong.

Only functions with grants are described. A container's environment stays what
its `env` says; describing containers is not covered here.

## In code

Nothing above asks for a library: any code can read those variables, in any
language. A Python function needs no more than:

```python
import os, re

def described(env=os.environ):
    resources = {}
    for name in filter(None, env.get("ENSEMBLE_RESOURCES", "").split(",")):
        prefix = "ENSEMBLE_RESOURCE_" + re.sub(r"[^A-Z0-9]+", "_", name.upper()) + "_"
        resources[name] = {k[len(prefix):].lower(): v for k, v in env.items() if k.startswith(prefix)}
    return resources
```

(Output names come out as `public_url`, `engine`, `type`; a name that is the
start of another, `files` and `files-extra`, needs the longest-prefix rule
above.)

What a project usually wants on top is a small resolver that turns an entry into
a port, and that is the project's own code — a library of **adapters**, one per
`(type, engine)`, each the only place that knows that technology:

```ts
// @ensemble-adapters/aws-dynamo
export const keyValue = adapter(
  "key-value",
  "dynamodb",
  (entry) =>
    new Table(new DynamoDBClient({}), entry.name, {
      partition: entry.outputs.partition,
      sort: entry.outputs.sort,
    }),
);

// the entry point, the same on every platform
const resources = Resources.from(env, adapters);
const table = resources.table("experiences"); // a portable Table, whatever holds it
const files = resources.bucket("files");
```

Two properties follow from the design:

- **Portable by default.** `table(name)` and `bucket(name)` return the portable
  port, with only what every engine can promise (for a table: reads, queries,
  and writes conditional on a version). The code can't lean on a feature only
  one engine has, because the port doesn't offer it.
- **A specific technology is a separate, visible call.** Code that needs one
  engine's own API asks for it by name —
  `resources.as<Pg>("ledger", "relational",
  "postgres")` — and it works only
  where the manifest pins that engine, failing at the first request and saying
  so otherwise. The pin in the manifest and the call in the code are the two
  halves of one explicit choice.

Which adapters a bundle holds is the platform's concern. Where a build kit
passes the deploy kit's name as a package condition for an integration
(`integrations/<kit>/<app>`), a registry package can pick that kit's adapter
list through `exports` — the aws bundle then carries DynamoDB and S3, the
cloudflare one D1 and R2, and neither the other's SDK. Without that, an
integration folder (`source/integrations/<kit>/<app>`, see
[Workspace layout](workspace-layout.md#integrations)) lists its platform's
adapters in its own `main.ts`.

## When portable isn't enough

The entry is portable by default: `fetch(request, env)` knows nothing of the
platform that runs it, and the kit adapts it (on aws, a Lambda handler around
it). That is what lets a team move between platforms for reasons outside the
code — cost, reachability, a customer's requirement — without touching it.

Code that needs what only one platform offers (Lambda's event and context,
Workers' bindings and `ctx`) doesn't reach for it through the portable entry. It
commits to that platform with an **integration**: a folder
`source/integrations/<kit>/<app>/` whose `main.ts` replaces the app's own entry
for that kit only, and exports whatever that platform runs.

```ts
// source/integrations/aws/server/main.ts
import { Api } from "../../../apps/server/api.ts";

export const handler = async (event, context) => {/* Lambda, in full */};
```

The integration is a separate entry, not a separate program: the logic stays in
the app's modules and the integration imports it, so what is platform-specific
is only the thin edge. The other kits keep building the portable entry. The
commitment is visible where it is made — a folder named for the platform — and
nothing in the portable entry can quietly depend on it.

## Writing a kit: declaring engines

A deploy kit says which engines it provides in its realization, from one table:

```ts
const ENGINES = new KitSdk.Deploy.Engines({
  "databases.key-value": { provides: ["dynamodb"], default: "dynamodb" },
  "storage.object-storage": { provides: ["s3"], default: "s3" },
});

// in the realization:
defaultFor: async (category, type, concern) => ENGINES.defaultFor(category, type, concern),
enginesFor: async (category, type) => ENGINES.provides(category, type),
```

A provisioner reads the negotiated engine from `request.values.engine?.value`
when it realizes a type differently per engine; it never has to report `engine`,
`partition` or `sort` as outputs. A kit that declares no engines for a type
(`enginesFor` absent) accepts a pin as written, so kits written before engines
keep working; declaring them is what makes a refusal explicit.

## What this does not do

- **Hide semantics.** The portable port promises a floor. Consistency models,
  transaction limits and latency still differ by engine, which is exactly what a
  pin is for.
- **Describe containers.** Only functions are described today.
- **Make every type portable.** A type is portable where its contract is small
  enough for several engines to keep. `relational`'s `version`, `user` and
  `passwordSecret` are still required and engine-shaped; a smaller portable SQL
  contract is future work.
- **Map other triggers.** Queues, schedules and streams don't fit `fetch`. A
  portable form (named exports the kits map to their own triggers, declared in
  the manifest, as Workers do with `scheduled` and `queue`) is noted for later;
  until then they belong in an integration.
