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
