# @ensemble/platform

A small HTTP server platform for the `ens` toolchain: each feature is a
self-contained package under `workflow/` (currently all three ship
concern themselves with running/managing workflows), exporting both a
server-side route handler and a typed client for calling it. There's no
shared "server core" abstraction beyond the minimal `Feature` descriptor
(`name`/`method`/`pattern`/`handle`) needed to mount routes — that's
deliberate; more shared plumbing gets extracted once a second unrelated
concern actually needs it, not speculatively now.

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

## Authentication

`manual-trigger` and `workflow-registry` both check the request's bearer
token against `.ensemble/platform/tokens.json` — a JSON object mapping each valid
token to the permissions it's been granted:

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
workflow <name>` run is unaffected by any of this — always in-process, no
Docker involved.
