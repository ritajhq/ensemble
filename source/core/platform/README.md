# @ensemble/platform

A small HTTP server platform for the `ens` toolchain: each feature is a
self-contained package under `workflow/` (every one so far concerns itself
with running/managing workflows, their git sources, or their secrets),
exporting both a server-side route handler and a typed client for calling
it. There's no shared "server core" abstraction beyond the minimal
`Feature` descriptor (`name`/`method`/`pattern`/`handle`) needed to mount
routes — that's deliberate; more shared plumbing gets extracted once a
second unrelated concern actually needs it, not speculatively now.

`source/apps/server/main.ts` is the actual runnable process: it mounts
every enabled feature's route on one `Deno.serve` and does nothing else.

## Features

Every feature is on by default; set `ENSEMBLE_FEATURE_<NAME>=false`
(name upper-cased, `-` → `_`) to disable one without removing it from
the feature list.

### `manual-trigger` — `POST /v1/workflows/:name/trigger`

Triggers a workflow by name. The target workflow must declare a `manual`
entry under its own `on:` (see `@ensemble/workflow`'s README) — a request
for a workflow that hasn't opted in is rejected with 403.

```jsonc
// request body ("job" may also be a list, e.g. ["build", "runner"])
{ "job": "build", "concurrency": 2, "variables": { "FOO": "bar" }, "context": "production", "inputs": { "sha": "...", "replicas": 3 } }
// response
{ "success": true }
```

`inputs` is validated against the workflow's declared `on: - manual:
inputs` (required-unless-`default`, strict per-`type` checking) and
becomes `trigger.<name>` for each declared input, plus `trigger.type ==
"manual"`. A missing required input or a type-mismatched value is
rejected with 400.

**Auth**: requires `Authorization: Bearer <token>` for a token granted
`trigger: true` in `.ensemble/platform/tokens.json` (see "Authentication" below).
Fails closed — a missing/unreadable tokens file, or a token without this
permission, both reject the request.

### `github-trigger` — `POST /v1/webhooks/github`

A single global endpoint (this is how GitHub webhooks work — one
configured URL per repo, not one per workflow). Fans out: on a `push`
event, scans every workflow under `workflows/` for an `on: - github:`
entry whose `push.tags` glob-matches the pushed tag, and triggers
every match, with `trigger.ref`/`trigger.tag`/`trigger.sha` populated
from GitHub's own payload fields.

**Auth**: requires a valid `X-Hub-Signature-256` header (GitHub's own
HMAC-SHA256 request signing), verified against `GITHUB_WEBHOOK_SECRET`.
Fails closed — if that env var isn't set, every push is rejected with
401, not silently accepted unsigned.

### `workflow-registry` — `PUT /v1/workflows/:name`

Uploads a `.tar.gz` of a workflow's whole directory tree (`workflow.yml`,
`steps/`, optionally its own `deno.json` — see the workflow README's
script contract for what "a full-fledged deno project" as a step means),
replacing whatever currently exists at `workflows/<name>`. Archive entries
are relative paths rooted at the workflow's own directory — no extra
`<name>/` wrapper folder.

The upload is extracted into a staging directory and validated (via
`parseWorkflowFile`) before ever touching the live directory, so an
invalid or malformed upload can't leave a broken workflow in place — it's
rejected with 400 and the live `workflows/<name>` is untouched.

**Auth**: requires `Authorization: Bearer <token>` for a token granted
`upload: true` in `.ensemble/platform/tokens.json` — a separate permission from
`manual-trigger`'s `trigger`, since the ability to overwrite a workflow's
code is a stronger capability than the ability to trigger an existing
one. A token can be granted one, the other, or both. Fails closed the
same way.

Only bulk tar.gz import is implemented so far. Fine-grained per-file
read/write endpoints (for a future UI that edits one script at a time
rather than re-uploading a whole archive per change) are deferred.

### `git-integration` — `/v1/integrations/git/...`

Registers a git repository as a workflow **source**: once registered, a
workflow can be created/synced from a path inside it (`createWorkflow`'s
optional `source`, or the ongoing `WorkflowGitLink` that keeps it resynced
on every trigger — see `@ensemble/core`'s `git-integration.ts`), and
`@ensemble/workflow`'s `context.secrets` can be decrypted for any
containerized/triggered run of that workflow (see "Secrets" below).

```jsonc
// POST /v1/integrations/git/register
{ "repoUrl": "https://github.com/acme/widgets.git", "projectName": "widgets", "auth": { "type": "pat", "token": "..." }, "secretsKey": "..." }
// response
{ "projectName": "widgets" }

// GET /v1/integrations/git/repositories
{ "repositories": [{ "projectName": "widgets", "repoUrl": "...", "authType": "pat", "registeredAt": "...", "lastFetchedAt": "...", "hasSecretsKey": true }] }

// POST /v1/integrations/git/repositories/:projectName/secrets-key
{ "secretsKey": "..." }

// POST /v1/integrations/git/repositories/:projectName/refresh   — re-fetches the cached checkout
// POST /v1/integrations/git/repositories/:projectName/remove    — unregisters; already-synced workflows keep their last content
// GET  /v1/integrations/git/repositories/:projectName/candidates — every workflow.yml found in the repo, for a "sync from git" picker
```

- **`auth`**: `{ type: "none" }` (default — public repo, no credentials) or
  `{ type: "pat", token: "..." }`. The token is never returned by any
  endpoint — `GET .../repositories` only ever reports `authType`.
- **`secretsKey`**: this repository's X25519 private key (the content of
  its own `.ensemble/secrets.key`, base64 pkcs8 — see `@ensemble/workflow`'s
  README's "Secrets (`context.secrets`)"), stored alongside the PAT at the
  same trust tier — never returned by any endpoint either; `GET
  .../repositories` only reports `hasSecretsKey: boolean`. Optional at
  registration, settable/rotatable afterwards via the dedicated
  `secrets-key` endpoint without a full re-registration. Absent entirely
  for a repo whose workflows declare no `context.secrets` — decryption
  then simply isn't available for that repo's server-triggered runs, the
  same graceful-degradation shape a missing key always had.
- This key is what lets a **containerized** run (manual trigger, GitHub
  webhook, dashboard "run now" — see "Running it" below) decrypt its own
  `context.secrets`: `runWorkflowByName` resolves it via
  `WorkflowGitLink.projectName → GitRepositoryRecord.secretsKey`
  (`resolveContainerizedSecretsKey` in `@ensemble/core`'s `workflow.ts`)
  and injects it into the spawned `runner` container as
  `ENSEMBLE_SECRETS_KEY` — never sourced from the server process's own
  environment (see `run-workflow-in-container.ts`'s
  `UNFORWARDED_ENV_VARS`), so one repo's key can never leak into another
  repo's run on the same server. A local, non-containerized `ens workflow
  run` is unaffected — it always reads `.ensemble/secrets.key` straight
  off disk instead.

**Auth**: `register`/`secrets-key`/`refresh`/`remove` all require
`upload: true`; `repositories`/`candidates` require `read: true`. Same
`.ensemble/platform/tokens.json` mechanism as everything else (see
"Authentication" below).

### `secrets` — `/v1/secrets/:workflowId/:context/...`

A dashboard-facing editor for a git-linked workflow's
`contexts/<context>/secrets.enc` — committing directly to that workflow's
linked repository rather than touching anything on this server's own
disk. Only works for a workflow with a `WorkflowGitLink` (created/synced
from a registered git repository, see `git-integration` above); a purely
local workflow 404s here with a message pointing at `ens workflow secrets
edit` instead — same file format either way, just a different write path.

```jsonc
// GET /v1/secrets/:workflowId/:context — key names only, never values
{ "keys": [{ "key": "REGISTRY_PASSWORD" }, { "key": "GH_TOKEN" }] }

// POST /v1/secrets/:workflowId/:context/:key/set
{ "value": "..." }
// response
{ "commitSha": "..." }

// POST /v1/secrets/:workflowId/:context/:key/delete
```

- **Encrypts, never decrypts.** Setting a value fetches the repo's own
  committed `.ensemble/secrets.key.pub` (via `GitWriteProvider.getFile`),
  encrypts the new value against it in memory, and commits the updated
  `secrets.enc` (via `GitWriteProvider.putFile`) — the server never needs,
  fetches, or stores the *private* key for this path. Reading back only
  ever returns key names for the same reason: there's nothing here capable
  of decrypting a value to show it, by design, not merely by convention.
- **Commits land in the real repo**, using that repo's registered PAT
  (`GitRepositoryRecord.auth`) through a `GitWriteProvider` — currently
  `createGithubContentsProvider()` (GitHub's Contents API), kept behind
  that interface so a future non-GitHub git host is a new implementation,
  not a rearchitecture (see `@ensemble/core`'s `git-write.ts`).
- The commit path is `workflows/<pathInRepo>/contexts/<context>/secrets.enc`,
  derived from the workflow's `WorkflowGitLink.pathInRepo` — the same
  layout `ens workflow secrets edit` produces locally, so either editor
  can pick up where the other left off with no format translation.

**Auth**: `GET` requires `read: true`; `set`/`delete` require
`upload: true` — same as `git-integration` above.

## Authentication

`manual-trigger`, `workflow-registry`, `git-integration`, and `secrets`
all check the request's bearer token against
`.ensemble/platform/tokens.json` — a JSON object mapping each valid token
to the permissions it's been granted:

```json
{
  "<token-a>": { "trigger": true, "upload": true },
  "<token-b>": { "trigger": true }
}
```

The file is never committed (gitignored, like `.ensemble/bin/`) and lives
under the server's own repo root, resolved the same way everything else
is (`findRepoRoot()`). Every candidate token is compared in constant time
regardless of match position, so response timing can't be used to probe
which stored token (if any) is closest to a guess. The file is cached in
memory and only re-read when its mtime changes, so rotating a token
doesn't require a server restart.

`github-trigger`'s `GITHUB_WEBHOOK_SECRET` is unrelated to this — it
verifies an inbound webhook's HMAC signature, not a caller-presented
token, so it stays its own env var.

**This is a deliberately temporary bridge**, not the intended long-term
design — a real authorization layer (named credentials, finer-grained
scopes, revocation without rotating every other caller's token) is
planned to replace it outright, not extend it.

## Programmatic clients

```ts
import { manualTriggerClient, workflowRegistryClient } from "@ensemble/platform";

const trigger = manualTriggerClient({ baseUrl: "https://ci.example.com", token: "..." });
await trigger.actions.trigger("deploy", { inputs: { sha: "..." } });

const registry = workflowRegistryClient({ baseUrl: "https://ci.example.com", token: "..." });
await registry.actions.upload("deploy", tarGzBytes);
```

There's no client for `github-trigger` — GitHub is the caller, not
something this codebase calls.

## Running it

```
deno task server            # local dev, PORT defaults to 8787
```

See `source/ship/server/README.md` for the actual deployment steps
(including the Docker socket + `runner` image wiring a server-triggered
run needs — manual trigger, GitHub webhook, dashboard "run now" all
execute inside a spawned `runner` container, not in-process; see
`trackedRunWorkflowByName`/`run-workflow-in-container.ts` in
`@ensemble/core` for the mechanism). A local, non-server-triggered `ens
workflow run <name>` run is unaffected by any of this — always in-process,
no Docker involved.
