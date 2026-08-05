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
