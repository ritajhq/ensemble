## [0.0.3] - 2026-08-20

### 🚀 Features

- *(workflow)* Resolve self repository for server/containerized runs

### 🐛 Bug Fixes

- *(workflow)* Make self a job/step in.repository value, not a resources.repositories entry
## [0.0.3] - 2026-08-20

### 🚀 Features

- *(workflow)* Replace config.local.yaml repo overrides with in: self + --local/--repository

### 🐛 Bug Fixes

- *(version,release)* Scope bump target to current pre-release line

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.2
## [0.0.2] - 2026-08-20

### 🐛 Bug Fixes

- *(init)* Disable minimum dependency age in scaffolded projects' deno.json
- *(kits)* Scope minimum-dependency-age bypass to kit subprocess spawns, not project deno.json

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.1
## [0.0.1] - 2026-08-20

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 1.0.10-alpha
- Update deno.lock
## [1.0.10-alpha] - 2026-08-20

### 🐛 Bug Fixes

- *(release)* Pass --allow-dirty to deno publish after pinning workspace deps
## [1.0.9-alpha] - 2026-08-20

### 🐛 Bug Fixes

- *(ship/runner)* Add jq back to the Dockerfile (dropped by earlier reset)
## [1.0.8-alpha] - 2026-08-20

### 🐛 Bug Fixes

- *(release)* Pin workspace-internal jsr: deps to release version before publishing
## [1.0.7-alpha] - 2026-08-20

### 🐛 Bug Fixes

- *(workflow)* Replace text import attribute with readTextFile for JSR compat
## [1.0.6-alpha] - 2026-08-20

### 🚀 Features

- *(jsr)* Publish kit-sdk, core, workflow, and event to JSR on production release
- *(workflows/release)* Add JSR_TOKEN secret

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 1.0.5-alpha
## [1.0.5-alpha] - 2026-08-19

### 🐛 Bug Fixes

- *(deploy)* Resolve docker GID from socket stat instead of getent

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 1.0.4-alpha
## [1.0.4-alpha] - 2026-08-19

### 🚀 Features

- *(kits)* Add scaffold.ts to build kits, wire ens app create
## [1.0.3-alpha] - 2026-08-19

### 🚀 Features

- *(ship/runner)* Add docker-cli-compose and coreutils to the Dockerfile dependencies

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 1.0.2-alpha
## [1.0.2-alpha] - 2026-08-19

### 🚀 Features

- *(workflow/deploy)* Take image tag as manual git-tags input
- *(runs)* Persist and surface a run's resolved deploy context in the dashboard
- *(workflow/dashboard)* Add per-workflow endpoint that resyncs its git link
- *(cli/init)* Drop self-vendoring, sparse-checkout kits, scaffold example test workflow
- *(workflow/dashboard)* Render git-tags manual inputs as a searchable combobox
- *(web)* Replace secrets/variables tabs with stacked sections, each with its own search

### 🐛 Bug Fixes

- *(workflow/release)* Narrow test-tag exclusion to only *-test, not any pre-release tag
- *(workflow/dashboard)* Resync git-linked workflows before listing

### 🎨 Styling

- *(web)* Subtle theme-aware scrollbars, stable scrollbar gutter, and a fixed workflow tab strip

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 1.0.1-alpha
## [1.0.1-alpha] - 2026-08-18

### 🚀 Features

- *(workflow)* Let github triggers declare a per-tag-pattern deploy context
- *(workflow/release)* Add github trigger context
## [1.0.0-alpha] - 2026-08-18

### 🚀 Features

- *(web)* Convert job selects to Select component, fix broken select.tsx theme classes
- *(pack)* Support --watch for kits that declare it
- *(deploy)* Watch-build cli/server/web and sync the compiled cli into server
- *(workflow)* Make the job manual input always a list, add multi-select combobox
- *(deploy)* Add watch_runner job to keep the runner image in sync with the compiled cli
- *(release)* Add a manual trigger with local/production context branching
- *(web)* Keep relative timestamps live and add hover tooltips
- *(workflow)* Expose a workflow's contexts/ subfolder names as a trigger UI picker
- *(release)* Add hot-server build/publish, remove workflows/server
- *(workflows)* Remove local workflow files and configurations
- *(workflow,platform)* Replace server-side vault with git-committed encrypted secrets
- *(workflows)* Migrate deploy, release, and demo to encrypted secrets.enc
- *(web,platform)* Add a git integration detail page with editable access, secrets key, and unregister
- *(web,platform)* Enhance SecretsView with edit functionality and improved error handling for Git integration
- *(workflow)* Restructure context.files and split context.secrets into variables/files
- *(cli)* Support editing context.secrets.files via workflow secrets edit
- *(platform,web)* Dashboard support for context.secrets.files
- *(workflow)* Add ensemble.artifacts()/ensemble.packages() namespaced expression functions
- *(workflow)* Auto-apply set -euo pipefail to run: steps
- *(platform,web)* Add Secrets and variables tab with plain context.variables/files view
- *(workflow/deploy)* Simplify API path matching in Caddyfile
- *(workflow/release)* Reintroduce changelog update and GitHub release steps

### 🐛 Bug Fixes

- *(workflow/server)* Make manual trigger's job input a list default
- *(deploy)* Rename production tfvars to the name terraform_apply expects, add unused-caddy placeholder
- *(workflows/deploy)* Correct image reference for web service in dockercompose stack
- *(platform,web)* Handle missing git write access for secrets, fix Select showing raw values
- *(docs)* Update backlog

### 🚜 Refactor

- *(deploy)* Replace Terraform with plain Docker Compose and structured context.variables
- *(workflows)* Migrate demo and release to context.secrets.variables/files
- *(workflow)* Standardize context variables/secrets storage on .yml

### 📚 Documentation

- *(deploy)* Add a production deploy guide

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.32-test
- *(deploy)* Bump dockercompose provider lockfile to v0.2.2
## [0.0.32-test] - 2026-08-09

### 🚀 Features

- *(workflow)* Add context.name and ensembleArtifacts() expression functions
- *(deploy)* Resolve terraform artifacts/caddy paths via contextFile()/ensembleArtifacts()

### 🐛 Bug Fixes

- *(kit)* Force-touch react.spa's css output so watch always syncs it

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.31-test
- Log build success in deno.bundle kit, ignore deploy's workspace dir, backlog note
## [0.0.31-test] - 2026-08-08

### 🚀 Features

- *(workflow)* Replace contexts:/secrets: with a unified context: block and pluggable loaders
- *(workflow,platform)* Decouple git registration from workflow creation
- *(workflow)* Expose context.variables via dot-access interpolation
- *(workflow)* Change context.variables from a map to a list, matching context.secrets
- *(workflow)* Add contextFile()/contextSecretFile() interpolation for raw context files
- *(deploy)* Add dev-only Caddy gateway via docker-compose profiles

### 🐛 Bug Fixes

- *(workflow)* Collect context.variables/secrets into one shared .env file per context
- *(deploy)* Use abspath() for the Caddyfile bind mount

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.30-test
- *(deploy)* Bump dockercompose provider lockfile to v0.2.1
## [0.0.30-test] - 2026-08-07

### 🚀 Features

- *(workflow,dashboard)* Add manual trigger to deploy, dashboard context picker for contexts:
- *(ui)* Export Select component, use it for the context picker
- *(workflow/deploy)* Add artifacts_dir variable to terraform apply step
- *(workflow/server)* Add .gitignore to exclude .env files

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.29-test
## [0.0.29-test] - 2026-08-07

### 🐛 Bug Fixes

- *(workflow)* Let secrets: be satisfied by caller variables, not just Deno.env
- *(workflow)* Always forward HOME to secrets:-scoped steps
## [0.0.28-test] - 2026-08-07

### 🚀 Features

- *(cli)* Add --env-file to ens workflow for loading variables/secrets from a .env file

### 🐛 Bug Fixes

- *(platform)* Resync git-integrated workflows automatically before every run

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for null
## [0.0.27-test] - 2026-08-07

### 🚀 Features

- *(workflow)* Reject stale or forward-referenced steps.<id> at parse time

### 🐛 Bug Fixes

- *(workflows/release)* Use trigger.tag instead of git describe

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.26-test
## [0.0.26-test] - 2026-08-07

### 🐛 Bug Fixes

- *(workflows/release)* Reference the tag step by its actual id

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.25-test
## [0.0.25-test] - 2026-08-07

### 🐛 Bug Fixes

- *(workflow)* Move docker login step to the beginning of the release job
## [0.0.24-test] - 2026-08-06

### 🚀 Features

- *(workflow)* Add secrets: to scope which env vars steps can read

### 🚜 Refactor

- *(workflows/release)* Docker login once per job instead of per push step
## [0.0.23-test] - 2026-08-06

### 🚀 Features

- *(workflow)* Add resources.repositories for declarative checkout
- *(ship)* Add dedicated runner image, trim server to just docker-cli
- *(workflow)* Run server-triggered workflows in a spawned container
- *(workflows/local)* Wire docker socket + host path so server can spawn runner containers
- *(workflow)* Allow local config.local.yaml overrides for resources.repositories
- *(workflow)* Add step-level in.repository to default a step's cwd to a checkout
- *(workflows)* Convert server and local to resources.repositories + in.repository
- *(workflow)* Allow job-level in.repository as every step's default
- *(workflow)* Add contexts: for required, validated, local-or-remote deploy contexts
- *(workflows/deploy)* Add deploy workflow for ensemble's own server+web via Terraform
- *(workflow)* Add packing and pushing steps for runner
- *(ship/server)* Add git and curl
- *(workflow/server)* Split in multiple jobs
- *(workflow/server)* Add manual job input for workflow
- *(workflow)* Support running multiple jobs via -j/--job and manual job inputs

### 🐛 Bug Fixes

- *(workflows/release)* Install git-cliff to /tmp instead of /usr/local/bin
- *(workflow/server)* Dedupe compile_cli into its own job to avoid a concurrent-write race
- *(core)* Mount docker socket into spawned runner containers
- *(core)* Forward server's env into spawned runner containers

### 🚜 Refactor

- *(core/config)* Namespace local repository overrides under workflows:

### 📚 Documentation

- Document resources.repositories, in:, and container-per-run deployment
## [0.0.22-test] - 2026-08-05

### 🐛 Bug Fixes

- *(kits/build/react.spa)* Download the musl Tailwind binary on Alpine, install libstdc++/libgcc to run it
## [0.0.20-test] - 2026-08-05

### 🚀 Features

- *(dashboard)* Add realtime run/step status via SSE
- *(dashboard)* Add run deletion with confirmation dialog

### 🐛 Bug Fixes

- *(core)* Prefer walking cwd over ENSEMBLE_WORKSPACE in findRepoRoot
- *(kits/pack/docker)* Disable build cache to avoid stale COPY --from=packages layers
- *(ship/server)* Copy ensemble-linux-x64 instead of stale cli.exe
- *(core)* Silence remaining deno subprocess logs, chunk step logs to fit Deno KV's size limit
- *(apps/web)* Update import path for Table component
- *(workflow/server)* Add production flag to build_server and build_web steps
## [0.0.19-test] - 2026-08-05

### 🚀 Features

- *(workflows/server)* Log in to registry before pushing server image
- *(workflows/server)* Add packing and pushing for web artifacts
- *(ship/web)* Use hot-server image

### 🐛 Bug Fixes

- *(workflows)* Add manual publishing to workflow server and correct s3 path in workflow release
- *(deno)* Silence download/cache output with -q flag
- *(ship/server)* Install minio-client and alias it to mc
- *(ship/server)* Add env vars in dockerfile as reference
- *(workflows/server)* Correct s3 env var names
- *(workflows/server)* Cd to ENSEMBLE_WORKSPACE before referencing source/ paths
- *(workflows)* Correct release bucket name
- *(workflows/server)* Mirror web artifacts instead of cp to avoid stale files
- *(workflows/release)* Mirror web artifacts instead of cp to avoid stale files
- *(ship/server)* Remove secrets from Dockerfile ENV to avoid baking them into image layers
- *(workflows/server)* Add hot-server publishing
- *(workflows/server)* Simplify hot-server packing and tagging
- *(platform)* Remove dashboard-static feature, hot-server owns serving the web app
- *(workflows/release)* Update web image build and publish steps for production

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.18-test
## [0.0.18-test] - 2026-08-05

### 🚀 Features

- *(workflow)* Emit job and step lifecycle events
- *(core)* Add git-integration and kv-backed run tracking
- *(platform)* Add v1 dashboard, run, and git-integration routes
- *(libs)* Add shared ui component library
- *(apps/web)* Add workflow dashboard application
- *(ship)* Add hot-server for local dev asset serving
- *(cli)* Resolve --version from the installed binary marker
- Add react/jsx workspace config and dashboard dependencies
- Add workflow variables block, run: interpolation, and structured context
- Replace http trigger with manual trigger and typed inputs
- Add -v/--var flag to pack, rename build's to -v, and support local var defaults
- *(ui)* Add InputGroup and Tabs components, fix table theme colors
- *(platform)* Track integrated git repos, support refresh/remove/restore
- *(dashboard)* Redesign workflows/runs UI, track run trigger source
- *(workflows)* Add demo workflow that always succeeds
- *(dashboard)* Show an icon per breadcrumb, add padding and larger text
- *(dashboard)* Trigger-specific run buttons with input sheets
- *(workflows/demo)* Take a message input, sleep 5s to simulate work
- *(dashboard)* Run detail view with job dependency flow diagram
- *(dashboard)* Line numbers, resizable sheet, and copy button for step logs
- *(workflow)* Support outputs on run: steps via $WORKFLOW_OUTPUT

### 🐛 Bug Fixes

- *(ship/server)* Enable deno kv for the server image
- Add variables to the workflow.yml JSON schema
- Rename workflow's --var short flag from -e to -v
- *(workflows/local)* Run container as non-root, fix caddy port, ignore all kv files
- *(kits/build/react.spa)* Re-render index.html on change during --watch
- *(dashboard)* Show git repositories' last-synced time as relative
- *(ui)* Drop dead cn-font-heading class, use muted-foreground token
- *(workflows/local)* Use port 8999 for caddy to avoid local conflict

### 📚 Documentation

- *(platform)* Update route paths for v1 prefix
- Describe project principles and add logo
- Rewrite root README usage/intro, document all commands in detail
- Clarify README opening thesis wording

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.17-test
- *(libs)* Add event delegate library
- *(apps)* Relocate placeholder spa from apps/web to apps/demo
- *(ship/web)* Relocate spa dockerfile and pack config
- *(config)* Point web and demo/spa at the react.spa kit
- Relocate ensemble ignore rules under .ensemble
- Add devcontainer setup
- Add local dev-loop workflow with caddy reverse proxy
- Add proper gitignore for source/artifacts dir
- Relocate tokens.json under .ensemble/platform/
- Update backlog
- Tidy up local workflow resources
- *(dev)* Add kivi devcontainer extension, keep tailwind css watch alive
- *(workflows/local)* Gitignore synced workflow clone directory
- *(web)* Default to dark mode
## [0.0.17-test] - 2026-07-28

### 🚀 Features

- *(cli/workflow)* Add context flag

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.16-test
## [0.0.16-test] - 2026-07-26

### 🐛 Bug Fixes

- *(release)* Build server and pack cli before building image
## [0.0.15-test] - 2026-07-26

### 🐛 Bug Fixes

- *(ship/server)* Add docker-cli-buildx for buildx build support
## [0.0.14-test] - 2026-07-26

### 🚀 Features

- *(ship/server)* Add docker-cli
## [0.0.13-test] - 2026-07-26

### 📚 Documentation

- Update readme

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.12-test
## [0.0.12-test] - 2026-07-26

### 🚀 Features

- *(workflow)* Wrap step logs in start/end markers with name/type label
- *(workflows/server)* Add server image publishing in release workflow

### 🐛 Bug Fixes

- *(cli/release)* Show tag preview before confirmation prompts, not just in dry-run

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.11-test
## [0.0.11-test] - 2026-07-25

### 🐛 Bug Fixes

- *(workflow)* Let run: steps' ens subcommands find the repo root
- *(workflows/server)* Use ens bin instead of task

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.0.10-test
## [0.0.10-test] - 2026-07-25

### 🚀 Features

- *(release)* Name the compiled cli binary ensemble-linux-x64
- Add install.sh for curl-based installation
- *(cli)* Add ens version command to check and self-update the installed binary

### 🐛 Bug Fixes

- *(workflows/release)* Retry the changelog push with rebase if main moved

### 📚 Documentation

- Add installation section to README
## [0.0.9-test] - 2026-07-25

### 🐛 Bug Fixes

- *(workflows/release)* Wire gh as git credential helper so the changelog push authenticates
## [0.0.8-test] - 2026-07-25

### 🐛 Bug Fixes

- *(workflows/release)* Pin git-cliff to 2.13.1, download via wget instead of curl pipe
## [0.0.7-test] - 2026-07-25

### 🐛 Bug Fixes

- *(workflows/release)* Install git-cliff from release tarball, not broken installer script
## [0.0.5-test] - 2026-07-25

### 🐛 Bug Fixes

- *(workflow)* Give each run a fresh scratch cwd instead of reusing workflowDir
- *(release)* Create tag only after all prompts are answered
## [0.0.4-test] - 2026-07-25

### 🐛 Bug Fixes

- *(ship/server)* Add curl in docker image
## [0.0.3-test] - 2026-07-25

### 🚀 Features

- *(ship/server)* Add git and gh cli
- *(workflows)* Add ensemble server recipe to ease manual updates
- *(schemas)* Add json schema for workflow.yml
- *(workflow)* Add --remote flag and workflow remote configure for remote triggering
- *(workflow)* Add remote upload command using the existing registry endpoint
- *(platform)* Replace per-feature bearer tokens with .ensemble/tokens.json permissions
- *(workflows)* Add release workflow

### 💼 Other

- *(workflows)* Move ensemble server recipe to just server folder since ensemble is already the whole proejct
## [0.0.2-test] - 2026-07-24

### 🚀 Features

- *(pack)* Add deno.compile pack kit, envs/pack/<ship>.env support

### 🐛 Bug Fixes

- *(pack)* Let -o/--output-name override compile.yml's output field
- *(pack)* Add packages build context

### 🚜 Refactor

- *(workflow)* Flatten github trigger's event.push to push
## [0.0.1-test] - 2026-07-24

### 🚀 Features

- *(workflow)* Add @ensemble/workflow CI-style pipeline engine with matrix jobs
- *(cli)* Add ens init to scaffold a new project by vendoring ensemble
- *(platform)* Add server platform with trigger-workflow feature
- *(workflow)* Add on: triggers (http, github push-tags) with trigger.* context
- *(ship/server)* Add server ship image with mandatory trigger authentication
- *(platform)* Add workflow-registry feature for tar.gz upload to workflows/<name>
- *(cli)* Add --output-name flag to pack for separate ship output naming
- *(cli)* Add ens config set-build-kit command
- *(cli)* Add ens release command (next/set/undo)
- *(ship/server)* Add md guide, use /workspace as workdir
- *(release)* Prompt to push commits+tag, warn on uncommitted changes before tagging

### 🐛 Bug Fixes

- *(core/release)* Drop v prefix from release tags
- *(core/releases)* Use h3 for version number heading
- *(cli/release)* Hoist --dry-run/-p/-m/-r to global options shown on all subcommands

### 🚜 Refactor

- *(release)* Remove changelog generation, tag creation only

### ⚙️ Miscellaneous Tasks

- Init
- Formatting
