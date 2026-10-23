## [0.61.0] - 2026-10-23

### 🚀 Features

- *(cli)* Trim the printed markdown page to the drawing, one table of variables and secrets, and a sentence on externals
- *(cli)* Create a top-level docs folder in ens init
- *(platform)* Sync the platform's server, web and ens builds into its container under ens develop
- *(develop)* Start the local runtime on ens develop, front gateways with a local proxy, and drop --mode and development.env

### 📚 Documentation

- Regenerate the architecture pages of the platform and website manifests
- Show the file tree ens init creates, and describe the kits it fetches

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.60.0
- Clear backlog
- Update deploy artifacts
- *(release)* Bump library versions for 0.61.0
## [0.60.0] - 2026-10-23

### 🚀 Features

- *(manifest)* Accept an optional description on secrets and variables, and describe those of the platform and website manifests
- *(cli)* Add ens delivery show deploy, printing the deploy architecture with resolved relations as JSON, in a new @ensemble/delivery package
- *(deploy)* Rename container-orchestrated to container, always restart it, and let computes reach each other with ${compute.<name>.host}
- *(cli)* Ens delivery print renders markdown with a reladraw diagram of the architecture, in a dark and a light theme

### 🐛 Bug Fixes

- *(kits)* Compile deno.compile ships in a staged workspace with their own lockfile, and build the compile task through it

### 📚 Documentation

- Add the generated architecture pages of the platform and website manifests

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.59.0
- *(release)* Bump library versions for 0.60.0
## [0.59.0] - 2026-10-22

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.58.0
- *(release)* Bump library versions for 0.59.0
## [0.58.0] - 2026-10-21

### 🚀 Features

- *(cli)* Run a delivery task by name with the kit from config.yaml or -k, loading develop's env files, and read its scripts from tasks/

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.57.0
- *(release)* Bump library versions for 0.58.0
## [0.57.0] - 2026-10-21

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.55.1
- *(changelog)* Update for 0.55.0
- *(changelog)* Update for 0.56.0
- *(release)* Bump library versions for 0.57.0
## [0.56.0] - 2026-10-20

### 🚀 Features

- *(source/core)* Add platform-neutral function and key-value contracts
- Add contents, cors and development to object-storage
- *(.ensemble/kits)* Adapt function bundles to lambda on aws
- *(.ensemble/kits)* Provision functions, key-value tables and gateways on aws
- *(.ensemble/kits)* Fill buckets from contents, render their cors and sync rules on aws
- Give object-storage a publicUrl output, the bucket as a browser reaches it
- *(.ensemble/kits)* Deploy aws stacks through the kit's own scripts and keep functions and buckets in sync under ens develop
- Load a kit's own env file under ens develop
- *(.ensemble/kits)* Deploy to cloudflare workers, d1 and r2
- *(source/core)* Build and deploy each app's integration for the kit deploying it
- *(.ensemble/kits)* Run each app's own integration, one bundle per integration
- *(.ensemble/kits)* Let deno.compile compile an integration as well as an app
- Scaffold integrations and list them apart from apps
- *(source/core)* Declare an app's integrations in config.yaml, as a library or a program, never both

### 🐛 Bug Fixes

- *(.ensemble/kits)* Clean up after adapting bundles on aws
- *(source/core)* Refuse an integration with nothing to build it, and reserve its prefix
- *(.ensemble/kits)* Find the repo from the rendered artifact instead of guessing

### 📚 Documentation

- Describe how the aws kit syncs functions and buckets under ens develop
- *(source/core)* Describe gateway routes to buckets and the kits that route them
- *(docs/documentation)* Describe integrations
- Draw what a deploy runs for an app, explicit steps against conventions
- Redraw what a deploy runs for an app with the integrations in config.yaml

### ⚡ Performance

- *(source/core)* Pack only the deploying kit's integration

### 🚜 Refactor

- *(.ensemble/kits)* Run the function bundle's entry as core names it

### ⚙️ Miscellaneous Tasks

- *(.ensemble)* Deploy the platform and the website through compose by default
- *(release)* Bump library versions for 0.56.0

### 💼 Other

- *(.ensemble/kits)* Keep the aws kit's lambda runtime out of deno's checks
## [0.54.0] - 2026-10-17

### 🚀 Features

- *(release)* Check every publish destination at once, listing each check's result as it comes back

### 🐛 Bug Fixes

- *(kits)* Treat a VS Code extension version already on the Marketplace as published, so release resume can rerun it
- *(release)* Commit every workspace manifest the library stamp repins, the kits among them
- *(release)* Keep a finished release's record so resuming it finds nothing left instead of redoing it all
- *(init)* Anchor the deploy cache's ignore rule so it stops matching the vendored deploy kits

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.53.0
- *(changelog)* Update for 0.53.0
- *(changelog)* Drop the duplicate 0.53.0 section
- *(kits)* Pin the kits to @ensemble/kit-sdk ^0.53.0
- Update lockfile
- *(release)* Bump library versions for 0.54.0
## [0.53.0] - 2026-10-16

### 🚀 Features

- *(platform)* Reach GitHub as the platform's own GitHub App, set up from its home page, in place of a token and per-project webhooks
- *(deploy)* Let config.yaml name a workload's deploy kit, and name the kit when no provisioner matches

### 📚 Documentation

- *(deploying)* Describe the platform's GitHub App in place of its token and per-project webhooks

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.52.1
- *(release)* Bump library versions for 0.53.0
## [0.52.1] - 2026-10-16

### 🚀 Features

- *(platform)* Show ensemble's logo in the sidebar and as the favicon
- *(platform)* Keep the sidebar from peeking on hover, leaving it to be resized from its rail

### 🐛 Bug Fixes

- *(platform)* Publish the platform's images to ghcr.io with every release so the platform can deploy itself

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.52.0
- *(release)* Bump library versions for 0.52.1
## [0.52.0] - 2026-10-15

### 🚀 Features

- *(compose)* Restart a critical container after a crash or a reboot
- *(platform)* Carry out every run in a container that outlives a platform restart, and rejoin it when the platform comes back
- *(platform)* Ship gh and git-cliff in the platform image so releases can run from it
- *(platform)* Update the platform alone, once every run in progress is over, holding runs asked for meanwhile for the platform it brings up

### 🐛 Bug Fixes

- *(release)* Repin every workspace member's versioned core-lib imports when stamping a release

### 📚 Documentation

- *(agent)* Mark the platform rollout's releases done and start the handoff at the server deploy

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.51.0
- *(platform)* Render the stack's compose file with its restart policies, registry logins and run settings
- *(release)* Bump library versions for 0.52.0
## [0.51.0] - 2026-10-15

### 🚀 Features

- *(release)* Refuse any publish this machine isn't authorized for, checked by each kit before anything changes
- *(ui)* Vendor idhn's ui library as source/libs/ui
- *(deploy)* Name a gateway on an ingress network after its deployment and record where each deploy answers there
- *(platform)* Add projects, sync their checkouts and show each delivery manifest with its first environment
- *(platform)* Add environments to a manifest and give each its variables and sealed secrets
- *(core)* Expose the process environment variable a manifest value is read from
- *(platform)* Deploy or plan an environment with a kit at a released version, following its run live
- *(platform)* Release a project with its credentials from a full checkout, keeping tokens out of failure messages
- *(platform)* Route every applied deployment's hosts through a router the platform configures, deployed with it as one stack
- *(platform)* Preview tracked branches at flat hosts from a non-production environment, replacing the preview service
- *(docker)* Pass a ship's pack vars to its Dockerfile as build args
- *(platform)* Sign in with the stack's own khatm and reach the platform and every preview only through idhn guards

### 🐛 Bug Fixes

- *(ui)* Bundle the vendored UI against the workspace's React through a local node_modules
- *(compose)* Commit the published-ports provisioner the kit already imports
- *(platform)* Resolve @ensemble/core from the workspace instead of pinning 0.50
- *(kits)* Pin the kits to @ensemble/kit-sdk ^0.51.0

### 📚 Documentation

- *(release)* Document publish authorization and add it to the release flow diagram
- *(agent)* Add the handoff for rolling out the platform on a server

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.50.0
- Update lockfile
- Update lockfile
- *(release)* Bump library versions for 0.51.0
## [0.50.0] - 2026-10-13

### 🐛 Bug Fixes

- *(kits)* Pin the aws and compose kits to @ensemble/kit-sdk ^0.49.0 so they resolve the Entrypoint API outside the workspace
- *(develop)* Ask the kit to quiet its watch tool so compose's progress display stays off the console

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.49.0
- *(release)* Bump library versions for 0.50.0
## [0.49.0] - 2026-10-13

### 🚀 Features

- *(version)* Install the latest release when ens version update is given no bump
- *(compose)* Add develop-only host ports and development.env, unpublish Garage, and reload the gateway Caddyfile
- *(deploy)* Add --instance, ens destroy and gateway alias for preview deployments
- *(preview)* Add the preview router delivery with a wildcard-certificate Caddy
- *(compose)* Let a compute publish a declared port on the host
- *(preview)* Add the preview service that deploys and destroys instances from branch pushes
- *(develop)* Hide the kit's stdout in a watch session and list the gateway routes once the stack is up

### 🐛 Bug Fixes

- *(preview)* Name both token permissions the Cloudflare DNS module needs

### 📚 Documentation

- *(preview)* Spell the preview manifest example in block style

### 🎨 Styling

- Format the codebase

### ⚙️ Miscellaneous Tasks

- *(changelog)* Update for 0.48.0
- Update lockfile
- *(release)* Bump library versions for 0.49.0
## [0.48.0] - 2026-10-07

### 🚀 Features

- _(deploy)_ Select development mode with an explicit --mode flag instead of
  deriving it from --watch

### 📚 Documentation

- Document develop mode, development.env and embedded references in task
  arguments

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.47.0
- _(release)_ Bump library versions for 0.48.0

## [0.47.0] - 2026-10-07

### 🐛 Bug Fixes

- _(delivery)_ Resolve references embedded in a task argument instead of passing
  them through as text
- _(react-kit)_ Create the app directory before scaffolding into it
- _(compose)_ Reload the gateway's Caddyfile through Caddy's admin API on apply

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.46.0
- _(release)_ Bump library versions for 0.47.0

## [0.46.0] - 2026-10-05

### 🚀 Features

- _(deploy)_ Tell provisioners whether ens develop or ens deploy brought the
  stack up
- _(deploy)_ Let a development block add environment variables only ens develop
  runs with

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.45.0
- _(release)_ Bump library versions for 0.46.0

## [0.45.0] - 2026-10-05

### 🚀 Features

- _(version)_ Add download progress, direct tag lookup, and gzipped release
  assets

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.44.0
- _(release)_ Bump library versions for 0.45.0

## [0.44.0] - 2026-10-05

### 🚀 Features

- _(deploy)_ Add list-typed variables and optional gateway networks

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.43.0
- _(release)_ Bump library versions for 0.44.0

## [0.43.0] - 2026-10-04

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.42.0
- _(release)_ Bump library versions for 0.43.0

## [0.42.0] - 2026-10-04

### 🚀 Features

- _(kits/compose)_ Accept gateway tls: none for plain HTTP and reject unknown
  tls values
- _(core/deploy)_ Read deployment values from the environment only, with
  repeatable --env-file opt-in and ens develop defaulting to dev.env +
  secrets.env
- _(core/deploy)_ Resolve references embedded inside strings when each resolves
  to a plain value

### 🐛 Bug Fixes

- _(release)_ Ignore pack-only ships when deciding what is left to publish so
  the release hook runs again
- _(kits/compose)_ Render env-sourced secrets as ${VAR:?} so an unset one fails
  instead of deploying empty

### 📚 Documentation

- _(cli)_ Note that --env-file also accepts absolute paths

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.41.0
- _(changelog)_ Backfill 0.20.0 through 0.40.0
- _(release)_ Bump library versions for 0.42.0

## [0.41.0] - 2026-10-04

### 🚀 Features

- _(core/deploy)_ Interpolate .ensemble/deploy/<name>/secrets.env keys into
  variables.env

### 🐛 Bug Fixes

- _(host)_ Type the workspace config settle timer as setTimeout's return type

### ⚙️ Miscellaneous Tasks

- _(kits)_ Pin @ensemble/kit-sdk to ^0.40.0 so kits never resolve an older sdk
- _(deploy)_ Drop InProcessKitLoader from the kit barrel and document that
  deploy kits always run in a subprocess
- _(release)_ Bump library versions for 0.41.0

## [0.40.0] - 2026-10-02

### 🚀 Features

- _(kits/build)_ Restart deno bundle watchers on workspace config changes and
  resolve workspace stylesheet imports for tailwind

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.40.0

## [0.39.0] - 2026-10-02

### 🚀 Features

- _(extension/vscode)_ Split the sidebar into apps, workloads, kits and
  libraries panes, run delivery tasks with input, follow ens updates and read
  ens output without colours

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.39.0

## [0.38.0] - 2026-10-02

### 🚀 Features

- _(extension/vscode)_ Add project sidebar, delivery code lenses and ens version
  status bar, backed by ens status --json and new kit/lib uninstall

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.38.0

## [0.37.0] - 2026-10-02

### 🐛 Bug Fixes

- _(extension/vscode)_ Find ens at the installer's default location or an
  ensemble.executable setting when it isn't on the editor's PATH

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.37.0

## [0.36.0] - 2026-10-02

### 🐛 Bug Fixes

- _(ship/extension-vscode)_ New name to avoid collision again

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.36.0

## [0.35.0] - 2026-10-02

### 🐛 Bug Fixes

- _(cli/release)_ Exit non-zero when packing or publishing fails
- _(ship/extension-vscode)_ New name to avoid collision

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.35.0

## [0.34.0] - 2026-10-02

### 🚀 Features

- _(extension/vscode)_ Prepare marketplace publish with icon, readme, metadata
  and a missing-ens prompt
- _(release)_ Warn when a ci workload has no delivery manifest instead of
  silently skipping it
- _(cli/release)_ Add --yes to answer every confirmation prompt for unattended
  runs

### ⚙️ Miscellaneous Tasks

- _(ship/cli)_ Exclude unused npm packages from the compiled binary
- _(release)_ Bump library versions for 0.34.0

## [0.33.0] - 2026-10-02

### 🚀 Features

- _(core/release)_ Move publish secrets to .ensemble/release/secrets.env and
  resume state to release/state

### 🐛 Bug Fixes

- _(ship/extension-vscode)_ Correct publisher id

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.33.0

## [0.32.0] - 2026-10-01

### 🚀 Features

- _(extension/vscode)_ Add hello-world VS Code extension with vscode pack kit
  and marketplace release
- _(cli/lsp)_ Add ens lsp with delivery manifest reference completion, wired
  into the VS Code extension
- _(core/deploy)_ Accept an extensionless delivery manifest alongside
  delivery.yml
- _(extension/vscode)_ Treat extensionless ci/*/delivery files as delivery
  manifests

### ⚙️ Miscellaneous Tasks

- Remove Copilot instructions from the repository
- _(release)_ Bump library versions for 0.32.0

## [0.31.0] - 2026-10-01

### 🚀 Features

- _(core/build)_ Pass build.<name>.options from config.yaml through to build
  kits

### 🐛 Bug Fixes

- _(kits/compose)_ Initial_sync every watch rule so a write landing before watch
  attaches still reaches the container

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.31.0

## [0.30.0] - 2026-09-29

### 🚀 Features

- _(init)_ Write .ensemble/.gitignore instead of a root .gitignore

### 🐛 Bug Fixes

- _(core/deploy)_ Tear down watch children on any exit and reclaim a crashed
  session's watcher on the next run

### ⚙️ Miscellaneous Tasks

- _(kits/react)_ Ignore its own .bin folder
- _(release)_ Bump library versions for 0.30.0

## [0.29.0] - 2026-09-28

### 🚀 Features

- _(release)_ Add confirmation step before packing and publishing ships/core
  libs

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.29.0

## [0.28.0] - 2026-09-28

### 🚀 Features

- _(website)_ Hand-roll a docs site in website/server
- _(git-sync)_ Pluggable trigger adapters + a local test UI
- _(ci/website)_ Add manual trigger to git-sync config

### 🐛 Bug Fixes

- _(website)_ Point the landing page's docs links at /docs
- _(git-sync)_ Install ca-certificates so git can clone over HTTPS
- Update gitignore to correctly exclude the artifacts/deploy folder
- _(readme)_ Update logo image path to correct branding location

### 📚 Documentation

- _(readme)_ Update usage section to quickstart format and streamline commands

### ⚡ Performance

- _(host)_ Serve every call into a deploy kit from one long-lived kit process
- _(core/deploy)_ Resolve task arguments from the last deploy, or render only
  what they reference

### ⚙️ Miscellaneous Tasks

- Update deploy artifacts
- _(release)_ Bump library versions for 0.28.0

## [0.27.0] - 2026-09-24

### 🚀 Features

- _(core/deploy)_ Run tasks a workload declares in its manifest

### 🐛 Bug Fixes

- _(kits)_ Render the gateway as Caddy with tls internal, on both networks
- _(core/init)_ Keep rendered deploy documents tracked and ignore the render
  cache

### 📚 Documentation

- _(readme)_ Point one-off provisioning at manifest-declared tasks

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.27.0

## [0.26.0] - 2026-09-24

### 🐛 Bug Fixes

- _(kits)_ Publish ports on ephemeral host ports, never the container's number

### 🧪 Testing

- _(kits)_ Keep the Garage seed-script tests runnable against an older pinned
  kit-sdk

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.26.0

## [0.25.0] - 2026-09-24

### 🐛 Bug Fixes

- _(core/deploy)_ Run apply-time init commands on the host, seeding Garage from
  there

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.25.0

## [0.24.0] - 2026-09-23

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.24.0

## [0.23.0] - 2026-09-23

### 🐛 Bug Fixes

- _(ci/website)_ Change git-sync port
- Update gitignore to correctly exclude the artifacts/deploy folder
- _(core/deploy)_ Resolve cross-compute port references at render time

### ⚙️ Miscellaneous Tasks

- Update deploy rendering
- _(release)_ Bump library versions for 0.23.0

## [0.22.0] - 2026-09-22

### 🚀 Features

- _(core/deploy)_ Add envSecrets to container-orchestrated contract
- _(git-sync)_ Scaffold webhook-triggered docs syncer app
- _(website)_ Wire docs-content volume and git-sync target into delivery
  manifest

### 🐛 Bug Fixes

- _(core/deploy)_ Wire the variables category to its own references

### 📚 Documentation

- Add getting-started, concepts, guides, and CLI reference sections

### 🚜 Refactor

- _(website)_ Move git-sync's REPOS config from secrets to variables

### ⚙️ Miscellaneous Tasks

- Move file to its place
- Update deno.lock for git-sync's dependencies
- Moving files to their correct place
- _(release)_ Bump library versions for 0.22.0

## [0.21.0] - 2026-09-20

### 🚀 Features

- _(website)_ Update copy
- _(status)_ Add ens status to discover apps/kits/libraries/workloads

### 🐛 Bug Fixes

- _(.ensemble)_ Update gitignore

### 📚 Documentation

- _(agent-context)_ Fix stale deploy paths, add aws kit, add CLAUDE.md pointer

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.21.0

## [0.20.0] - 2026-09-19

### 🚀 Features

- _(core/deploy)_ Add mounts to container-orchestrated via a storage.volume
  contract

### 🐛 Bug Fixes

- _(compose)_ Render sync+restart rules into develop.watch
- _(deploy)_ Wire animated pack/build reporters through ens deploy/develop

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.19.0
- _(release)_ Bump library versions for 0.20.0

## [0.19.0] - 2026-09-17

### 🚀 Features

- _(release)_ Persist ceremony progress and auto-continue past packing

### 🐛 Bug Fixes

- _(release)_ Don't re-run release hooks from resume

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.18.1
- _(changelog)_ Update for 0.18.1
- _(changelog)_ Remove duplicated 0.18.1 section
- _(release)_ Bump library versions for 0.19.0

## [0.18.1] - 2026-09-17

### 🐛 Bug Fixes

- _(deploy)_ Group development sync rules by action
- _(schema)_ Group development sync rules by action

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.17.0
- _(release)_ Bump library versions for 0.18.0
- _(changelog)_ Update for 0.18.0
- _(release)_ Bump library versions for 0.18.1

## [0.18.0] - 2026-09-17

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.17.0
- _(release)_ Bump library versions for 0.18.0

## [0.17.0] - 2026-09-17

### 🐛 Bug Fixes

- _(lib-kit)_ Forward JSR_TOKEN as --token when publishing to JSR
- _(release,pack)_ Thread animated pack/build reporters through the release
  ceremony

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.16.0
- _(release)_ Bump library versions for 0.17.0

## [0.16.0] - 2026-09-17

### 🐛 Bug Fixes

- _(core)_ Load deploy kits via one-shot subprocess spawns instead of in-process
  import

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.15.0
- Update lock
- _(release)_ Bump library versions for 0.16.0

## [0.15.0] - 2026-09-17

### 🐛 Bug Fixes

- _(cli)_ Include deno.lock in the core-lib version-bump commit, since
  stamping's subprocess spawns drift it too

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.14.0
- Update lock
- _(release)_ Bump library versions for 0.15.0

## [0.14.0] - 2026-09-17

### 🐛 Bug Fixes

- _(core)_ Pin versions as required by jsr
- _(core)_ Repin sibling core-lib imports before stamping, so a version bump
  doesn't break workspace resolution
- _(core)_ Bump every core lib's own version before any lib kit subprocess runs,
  so the first stamp doesn't see a stale workspace copy

### 🚜 Refactor

- _(core)_ Move coreLibs/libs config under a unified publish.core/publish.libs
  list schema

### ⚙️ Miscellaneous Tasks

- Update lock
- _(release)_ Bump library versions for 0.14.0

## [0.13.0] - 2026-09-17

### 🐛 Bug Fixes

- _(release)_ Correct core libs publishing order

### ⚙️ Miscellaneous Tasks

- _(release)_ Bump library versions for 0.13.0

## [0.12.0] - 2026-09-16

### 🚀 Features

- _(cli)_ Add an ens mcp server exposing commands as MCP tools for agents

### 🐛 Bug Fixes

- _(cli)_ Don't run release hooks when the ceremony was declined
- _(core,cli)_ Report ens develop app/config errors cleanly instead of crashing

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.11.0
- _(release)_ Bump library versions for 0.12.0

## [0.11.0] - 2026-09-16

### 🚀 Features

- _(release)_ Push whatever the release.after hooks committed
- _(core)_ Declare @ensemble/core as a publishable core lib

### 🚜 Refactor

- _(core)_ Declare core libs in .ensemble/config.yaml, not lib.yml
- _(core)_ Drop lib.yml entirely, track every lib in .ensemble/config.yaml

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.10.0

## [0.10.0] - 2026-09-16

### 🚜 Refactor

- _(cli)_ Make kit eject take remote as a positional argument
- _(release)_ Give release.after hooks names and run them as a list
- _(release)_ Stamp and commit core-lib version bumps before tagging

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.9.0
- Update version to 0.9.0 in deno.json
- _(release)_ Bump library versions for 0.10.0

## [0.9.0] - 2026-09-16

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.8.0
- _(changelog)_ Scope git-cliff to the latest tag and prepend instead of full
  regeneration
- _(changelog)_ Move cliff.toml into .ensemble/configs

## [0.8.0] - 2026-09-16

### 🚀 Features

- _(kit-sdk)_ Wire kit-sdk into the core-lib release cascade for jsr publishing
- _(release)_ Push tag only after ceremony succeeds, add resume for partial
  failures
- _(release)_ Pack every ship before publishing any of them

### 🐛 Bug Fixes

- _(release)_ Push the tag before publishing, not after, and clean up failure
  messaging

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.7.0

## [0.7.0] - 2026-09-16

### 🚀 Features

- _(kit)_ Add kit new and eject for authoring kits in-project

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.6.0

## [0.6.0] - 2026-09-16

### 🚀 Features

- _(vendor)_ Add kit/lib install, pin, update, contribute, eject, and lib
  publish

### 🐛 Bug Fixes

- _(init)_ Scaffold the top-level ci folder
- _(schema)_ Update delivery.yml schema references for resource types
- _(init)_ Vendor kits at the git tag matching the installed ens version

### 📚 Documentation

- _(deploy)_ Add JSON schema for delivery.yml autocomplete

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.5.0

## [0.5.0] - 2026-09-15

### 🚀 Features

- _(init)_ Scaffold source/core and add it to the workspace
- _(init)_ Scaffold a README describing the workspace and ens commands

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.4.0

## [0.4.0] - 2026-09-15

### 🚀 Features

- _(kit-sdk)_ Pass build target through to app scaffolding

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.3.4

## [0.3.4] - 2026-09-15

### 🐛 Bug Fixes

- _(deno.compile kit)_ Report its single actual dependency instead of every
  declared app
- _(init)_ Scope artifacts gitignore to the artifacts folder itself

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.3.3

## [0.3.3] - 2026-09-15

### 🚀 Features

- Animated build progress reporter with a rotating spinner for ens build
- Green pack progress reporter with --verbose to show the kit's raw build-tool
  output

### 🐛 Bug Fixes

- Forward termination signals to build kits' own spawned children

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.3.2

## [0.3.2] - 2026-09-15

### 🐛 Bug Fixes

- _(react kit)_ Silence Tailwind's routine build/watch chatter, keep its errors
  visible

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.3.1

## [0.3.1] - 2026-09-15

### 🚀 Features

- Prefix a deploy's compose/stack project name with the repo dir's own name

### 🐛 Bug Fixes

- Swallow the already-terminated race when a build watcher's kill signal fires
- _(website)_ Actually attach the server to the declared edge network

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.3.0

## [0.3.0] - 2026-09-15

### 🐛 Bug Fixes

- Forward emulateExternals through KitLoader, and skip double-building apps ens
  develop already watches

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.2.2

## [0.2.2] - 2026-09-15

### 🚀 Features

- Let pack kits report which apps they depend on before packing runs
- Build a ship's app dependencies before packing, drop the stale
  meta.ship.artifacts record

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.2.1

## [0.2.1] - 2026-09-15

### 🚀 Features

- Attach compute to external Docker networks, with --emulate-externals to stand
  them up locally

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.2.0

## [0.2.0] - 2026-09-14

### 🚀 Features

- Develop start also apps building on watch mode

### 🐛 Bug Fixes

- _(cli/delivery)_ Add version

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.1.0
- Formatting
- Typo

## [0.1.0] - 2026-09-08

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.12

### 💼 Other

- Save delivery output

## [0.0.11] - 2026-09-06

### 🚀 Features

- _(core)_ Skip ens build when source is unchanged
- _(kits/pack/docker)_ Register per-app build contexts by Dockerfile reference

### 🐛 Bug Fixes

- _(release)_ Remove deno publishing of event lib

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.10
- Remove unused files

## [0.0.10] - 2026-08-30

### 🚀 Features

- _(release)_ Add images_only input to control versioning and release updates
- _(github-trigger)_ Support push.branches alongside push.tags

### 🐛 Bug Fixes

- _(kits/pack/docker)_ Restore build cache

### ⚙️ Miscellaneous Tasks

- Update backlog

## [0.0.9] - 2026-08-25

### 🚀 Features

- _(git-integration)_ Add per-repository GitHub webhook secrets

### 🐛 Bug Fixes

- _(runner)_ Alias deno run to ens so workflow steps can shell out to it
- _(deploy)_ Derive SERVER_HOST_WORKFLOWS_PATH from SERVER_WORKSPACE_PATH
  instead of a separately declared context.variable

### ⚡ Performance

- _(dashboard)_ Skip redundant git ls-remote when a workflow's page was resynced
  recently

### 🚜 Refactor

- _(core)_ Namespace package barrels and convert resource-threading functions to
  classes
- _(platform)_ Move route paths to app-layer config, dedupe handler boilerplate

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.8

## [0.0.8] - 2026-08-21

### 🚀 Features

- _(platform)_ Add GET /v1/debug reporting the running image tag and mounted
  routes
- _(workflow)_ Authenticate private repo clones for self and
  resources.repositories

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.7

## [0.0.7] - 2026-08-21

### 🐛 Bug Fixes

- _(cli)_ Don't crash getInstalledVersion under deno run, only
  installNext/installSet need the compiled binary

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.6

## [0.0.6] - 2026-08-21

### 🐛 Bug Fixes

- _(git-integration)_ Skip re-cloning a workflow's git link when the remote SHA
  hasn't moved

### 📚 Documentation

- _(agent-context)_ Add AI/contributor onboarding doc

### 🚜 Refactor

- _(deploy)_ Matrix-ify watch_build jobs and ship runner/server from cli bundle
  instead of compiled binary

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.5

## [0.0.5] - 2026-08-21

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.4

## [0.0.4] - 2026-08-20

### 🚀 Features

- _(workflow)_ Resolve self repository for server/containerized runs
- _(dashboard)_ Stream run status updates over WebSocket instead of SSE
- _(dashboard)_ Add workflow settings page with rename and delete

### 🐛 Bug Fixes

- _(workflow)_ Make self a job/step in.repository value, not a
  resources.repositories entry

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.3

## [0.0.3] - 2026-08-20

### 🚀 Features

- _(workflow)_ Replace config.local.yaml repo overrides with in: self +
  --local/--repository

### 🐛 Bug Fixes

- _(version,release)_ Scope bump target to current pre-release line

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.2

## [0.0.2] - 2026-08-20

### 🐛 Bug Fixes

- _(init)_ Disable minimum dependency age in scaffolded projects' deno.json
- _(kits)_ Scope minimum-dependency-age bypass to kit subprocess spawns, not
  project deno.json

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.1

## [0.0.1] - 2026-08-20

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 1.0.10-alpha
- Update deno.lock

## [1.0.10-alpha] - 2026-08-20

### 🐛 Bug Fixes

- _(release)_ Pass --allow-dirty to deno publish after pinning workspace deps

## [1.0.9-alpha] - 2026-08-20

### 🐛 Bug Fixes

- _(ship/runner)_ Add jq back to the Dockerfile (dropped by earlier reset)

## [1.0.8-alpha] - 2026-08-20

### 🐛 Bug Fixes

- _(release)_ Pin workspace-internal jsr: deps to release version before
  publishing

## [1.0.7-alpha] - 2026-08-20

### 🐛 Bug Fixes

- _(workflow)_ Replace text import attribute with readTextFile for JSR compat

## [1.0.6-alpha] - 2026-08-20

### 🚀 Features

- _(jsr)_ Publish kit-sdk, core, workflow, and event to JSR on production
  release
- _(workflows/release)_ Add JSR_TOKEN secret

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 1.0.5-alpha

## [1.0.5-alpha] - 2026-08-19

### 🐛 Bug Fixes

- _(deploy)_ Resolve docker GID from socket stat instead of getent

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 1.0.4-alpha

## [1.0.4-alpha] - 2026-08-19

### 🚀 Features

- _(kits)_ Add scaffold.ts to build kits, wire ens app create

## [1.0.3-alpha] - 2026-08-19

### 🚀 Features

- _(ship/runner)_ Add docker-cli-compose and coreutils to the Dockerfile
  dependencies

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 1.0.2-alpha

## [1.0.2-alpha] - 2026-08-19

### 🚀 Features

- _(workflow/deploy)_ Take image tag as manual git-tags input
- _(runs)_ Persist and surface a run's resolved deploy context in the dashboard
- _(workflow/dashboard)_ Add per-workflow endpoint that resyncs its git link
- _(cli/init)_ Drop self-vendoring, sparse-checkout kits, scaffold example test
  workflow
- _(workflow/dashboard)_ Render git-tags manual inputs as a searchable combobox
- _(web)_ Replace secrets/variables tabs with stacked sections, each with its
  own search

### 🐛 Bug Fixes

- _(workflow/release)_ Narrow test-tag exclusion to only *-test, not any
  pre-release tag
- _(workflow/dashboard)_ Resync git-linked workflows before listing

### 🎨 Styling

- _(web)_ Subtle theme-aware scrollbars, stable scrollbar gutter, and a fixed
  workflow tab strip

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 1.0.1-alpha

## [1.0.1-alpha] - 2026-08-18

### 🚀 Features

- _(workflow)_ Let github triggers declare a per-tag-pattern deploy context
- _(workflow/release)_ Add github trigger context

## [1.0.0-alpha] - 2026-08-18

### 🚀 Features

- _(web)_ Convert job selects to Select component, fix broken select.tsx theme
  classes
- _(pack)_ Support --watch for kits that declare it
- _(deploy)_ Watch-build cli/server/web and sync the compiled cli into server
- _(workflow)_ Make the job manual input always a list, add multi-select
  combobox
- _(deploy)_ Add watch_runner job to keep the runner image in sync with the
  compiled cli
- _(release)_ Add a manual trigger with local/production context branching
- _(web)_ Keep relative timestamps live and add hover tooltips
- _(workflow)_ Expose a workflow's contexts/ subfolder names as a trigger UI
  picker
- _(release)_ Add hot-server build/publish, remove workflows/server
- _(workflows)_ Remove local workflow files and configurations
- _(workflow,platform)_ Replace server-side vault with git-committed encrypted
  secrets
- _(workflows)_ Migrate deploy, release, and demo to encrypted secrets.enc
- _(web,platform)_ Add a git integration detail page with editable access,
  secrets key, and unregister
- _(web,platform)_ Enhance SecretsView with edit functionality and improved
  error handling for Git integration
- _(workflow)_ Restructure context.files and split context.secrets into
  variables/files
- _(cli)_ Support editing context.secrets.files via workflow secrets edit
- _(platform,web)_ Dashboard support for context.secrets.files
- _(workflow)_ Add ensemble.artifacts()/ensemble.packages() namespaced
  expression functions
- _(workflow)_ Auto-apply set -euo pipefail to run: steps
- _(platform,web)_ Add Secrets and variables tab with plain
  context.variables/files view
- _(workflow/deploy)_ Simplify API path matching in Caddyfile
- _(workflow/release)_ Reintroduce changelog update and GitHub release steps

### 🐛 Bug Fixes

- _(workflow/server)_ Make manual trigger's job input a list default
- _(deploy)_ Rename production tfvars to the name terraform_apply expects, add
  unused-caddy placeholder
- _(workflows/deploy)_ Correct image reference for web service in dockercompose
  stack
- _(platform,web)_ Handle missing git write access for secrets, fix Select
  showing raw values
- _(docs)_ Update backlog

### 📚 Documentation

- _(deploy)_ Add a production deploy guide

### 🚜 Refactor

- _(deploy)_ Replace Terraform with plain Docker Compose and structured
  context.variables
- _(workflows)_ Migrate demo and release to context.secrets.variables/files
- _(workflow)_ Standardize context variables/secrets storage on .yml

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.32-test
- _(deploy)_ Bump dockercompose provider lockfile to v0.2.2

## [0.0.32-test] - 2026-08-09

### 🚀 Features

- _(workflow)_ Add context.name and ensembleArtifacts() expression functions
- _(deploy)_ Resolve terraform artifacts/caddy paths via
  contextFile()/ensembleArtifacts()

### 🐛 Bug Fixes

- _(kit)_ Force-touch react.spa's css output so watch always syncs it

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.31-test
- Log build success in deno.bundle kit, ignore deploy's workspace dir, backlog
  note

## [0.0.31-test] - 2026-08-08

### 🚀 Features

- _(workflow)_ Replace contexts:/secrets: with a unified context: block and
  pluggable loaders
- _(workflow,platform)_ Decouple git registration from workflow creation
- _(workflow)_ Expose context.variables via dot-access interpolation
- _(workflow)_ Change context.variables from a map to a list, matching
  context.secrets
- _(workflow)_ Add contextFile()/contextSecretFile() interpolation for raw
  context files
- _(deploy)_ Add dev-only Caddy gateway via docker-compose profiles

### 🐛 Bug Fixes

- _(workflow)_ Collect context.variables/secrets into one shared .env file per
  context
- _(deploy)_ Use abspath() for the Caddyfile bind mount

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.30-test
- _(deploy)_ Bump dockercompose provider lockfile to v0.2.1

## [0.0.30-test] - 2026-08-07

### 🚀 Features

- _(workflow,dashboard)_ Add manual trigger to deploy, dashboard context picker
  for contexts:
- _(ui)_ Export Select component, use it for the context picker
- _(workflow/deploy)_ Add artifacts_dir variable to terraform apply step
- _(workflow/server)_ Add .gitignore to exclude .env files

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.29-test

## [0.0.29-test] - 2026-08-07

### 🐛 Bug Fixes

- _(workflow)_ Let secrets: be satisfied by caller variables, not just Deno.env
- _(workflow)_ Always forward HOME to secrets:-scoped steps

## [0.0.28-test] - 2026-08-07

### 🚀 Features

- _(cli)_ Add --env-file to ens workflow for loading variables/secrets from a
  .env file

### 🐛 Bug Fixes

- _(platform)_ Resync git-integrated workflows automatically before every run

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for null

## [0.0.27-test] - 2026-08-07

### 🚀 Features

- _(workflow)_ Reject stale or forward-referenced steps.<id> at parse time

### 🐛 Bug Fixes

- _(workflows/release)_ Use trigger.tag instead of git describe

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.26-test

## [0.0.26-test] - 2026-08-07

### 🐛 Bug Fixes

- _(workflows/release)_ Reference the tag step by its actual id

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.25-test

## [0.0.25-test] - 2026-08-07

### 🐛 Bug Fixes

- _(workflow)_ Move docker login step to the beginning of the release job

## [0.0.24-test] - 2026-08-06

### 🚀 Features

- _(workflow)_ Add secrets: to scope which env vars steps can read

### 🚜 Refactor

- _(workflows/release)_ Docker login once per job instead of per push step

## [0.0.23-test] - 2026-08-06

### 🚀 Features

- _(workflow)_ Add resources.repositories for declarative checkout
- _(ship)_ Add dedicated runner image, trim server to just docker-cli
- _(workflow)_ Run server-triggered workflows in a spawned container
- _(workflows/local)_ Wire docker socket + host path so server can spawn runner
  containers
- _(workflow)_ Allow local config.local.yaml overrides for
  resources.repositories
- _(workflow)_ Add step-level in.repository to default a step's cwd to a
  checkout
- _(workflows)_ Convert server and local to resources.repositories +
  in.repository
- _(workflow)_ Allow job-level in.repository as every step's default
- _(workflow)_ Add contexts: for required, validated, local-or-remote deploy
  contexts
- _(workflows/deploy)_ Add deploy workflow for ensemble's own server+web via
  Terraform
- _(workflow)_ Add packing and pushing steps for runner
- _(ship/server)_ Add git and curl
- _(workflow/server)_ Split in multiple jobs
- _(workflow/server)_ Add manual job input for workflow
- _(workflow)_ Support running multiple jobs via -j/--job and manual job inputs

### 🐛 Bug Fixes

- _(workflows/release)_ Install git-cliff to /tmp instead of /usr/local/bin
- _(workflow/server)_ Dedupe compile_cli into its own job to avoid a
  concurrent-write race
- _(core)_ Mount docker socket into spawned runner containers
- _(core)_ Forward server's env into spawned runner containers

### 📚 Documentation

- Document resources.repositories, in:, and container-per-run deployment

### 🚜 Refactor

- _(core/config)_ Namespace local repository overrides under workflows:

## [0.0.22-test] - 2026-08-05

### 🐛 Bug Fixes

- _(kits/build/react.spa)_ Download the musl Tailwind binary on Alpine, install
  libstdc++/libgcc to run it

## [0.0.20-test] - 2026-08-05

### 🚀 Features

- _(dashboard)_ Add realtime run/step status via SSE
- _(dashboard)_ Add run deletion with confirmation dialog

### 🐛 Bug Fixes

- _(core)_ Prefer walking cwd over ENSEMBLE_WORKSPACE in findRepoRoot
- _(kits/pack/docker)_ Disable build cache to avoid stale COPY --from=packages
  layers
- _(ship/server)_ Copy ensemble-linux-x64 instead of stale cli.exe
- _(core)_ Silence remaining deno subprocess logs, chunk step logs to fit Deno
  KV's size limit
- _(apps/web)_ Update import path for Table component
- _(workflow/server)_ Add production flag to build_server and build_web steps

## [0.0.19-test] - 2026-08-05

### 🚀 Features

- _(workflows/server)_ Log in to registry before pushing server image
- _(workflows/server)_ Add packing and pushing for web artifacts
- _(ship/web)_ Use hot-server image

### 🐛 Bug Fixes

- _(workflows)_ Add manual publishing to workflow server and correct s3 path in
  workflow release
- _(deno)_ Silence download/cache output with -q flag
- _(ship/server)_ Install minio-client and alias it to mc
- _(ship/server)_ Add env vars in dockerfile as reference
- _(workflows/server)_ Correct s3 env var names
- _(workflows/server)_ Cd to ENSEMBLE_WORKSPACE before referencing source/ paths
- _(workflows)_ Correct release bucket name
- _(workflows/server)_ Mirror web artifacts instead of cp to avoid stale files
- _(workflows/release)_ Mirror web artifacts instead of cp to avoid stale files
- _(ship/server)_ Remove secrets from Dockerfile ENV to avoid baking them into
  image layers
- _(workflows/server)_ Add hot-server publishing
- _(workflows/server)_ Simplify hot-server packing and tagging
- _(platform)_ Remove dashboard-static feature, hot-server owns serving the web
  app
- _(workflows/release)_ Update web image build and publish steps for production

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.18-test

## [0.0.18-test] - 2026-08-05

### 🚀 Features

- _(workflow)_ Emit job and step lifecycle events
- _(core)_ Add git-integration and kv-backed run tracking
- _(platform)_ Add v1 dashboard, run, and git-integration routes
- _(libs)_ Add shared ui component library
- _(apps/web)_ Add workflow dashboard application
- _(ship)_ Add hot-server for local dev asset serving
- _(cli)_ Resolve --version from the installed binary marker
- Add react/jsx workspace config and dashboard dependencies
- Add workflow variables block, run: interpolation, and structured context
- Replace http trigger with manual trigger and typed inputs
- Add -v/--var flag to pack, rename build's to -v, and support local var
  defaults
- _(ui)_ Add InputGroup and Tabs components, fix table theme colors
- _(platform)_ Track integrated git repos, support refresh/remove/restore
- _(dashboard)_ Redesign workflows/runs UI, track run trigger source
- _(workflows)_ Add demo workflow that always succeeds
- _(dashboard)_ Show an icon per breadcrumb, add padding and larger text
- _(dashboard)_ Trigger-specific run buttons with input sheets
- _(workflows/demo)_ Take a message input, sleep 5s to simulate work
- _(dashboard)_ Run detail view with job dependency flow diagram
- _(dashboard)_ Line numbers, resizable sheet, and copy button for step logs
- _(workflow)_ Support outputs on run: steps via $WORKFLOW_OUTPUT

### 🐛 Bug Fixes

- _(ship/server)_ Enable deno kv for the server image
- Add variables to the workflow.yml JSON schema
- Rename workflow's --var short flag from -e to -v
- _(workflows/local)_ Run container as non-root, fix caddy port, ignore all kv
  files
- _(kits/build/react.spa)_ Re-render index.html on change during --watch
- _(dashboard)_ Show git repositories' last-synced time as relative
- _(ui)_ Drop dead cn-font-heading class, use muted-foreground token
- _(workflows/local)_ Use port 8999 for caddy to avoid local conflict

### 📚 Documentation

- _(platform)_ Update route paths for v1 prefix
- Describe project principles and add logo
- Rewrite root README usage/intro, document all commands in detail
- Clarify README opening thesis wording

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.17-test
- _(libs)_ Add event delegate library
- _(apps)_ Relocate placeholder spa from apps/web to apps/demo
- _(ship/web)_ Relocate spa dockerfile and pack config
- _(config)_ Point web and demo/spa at the react.spa kit
- Relocate ensemble ignore rules under .ensemble
- Add devcontainer setup
- Add local dev-loop workflow with caddy reverse proxy
- Add proper gitignore for source/artifacts dir
- Relocate tokens.json under .ensemble/platform/
- Update backlog
- Tidy up local workflow resources
- _(dev)_ Add kivi devcontainer extension, keep tailwind css watch alive
- _(workflows/local)_ Gitignore synced workflow clone directory
- _(web)_ Default to dark mode

## [0.0.17-test] - 2026-07-28

### 🚀 Features

- _(cli/workflow)_ Add context flag

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.16-test

## [0.0.16-test] - 2026-07-26

### 🐛 Bug Fixes

- _(release)_ Build server and pack cli before building image

## [0.0.15-test] - 2026-07-26

### 🐛 Bug Fixes

- _(ship/server)_ Add docker-cli-buildx for buildx build support

## [0.0.14-test] - 2026-07-26

### 🚀 Features

- _(ship/server)_ Add docker-cli

## [0.0.13-test] - 2026-07-26

### 📚 Documentation

- Update readme

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.12-test

## [0.0.12-test] - 2026-07-26

### 🚀 Features

- _(workflow)_ Wrap step logs in start/end markers with name/type label
- _(workflows/server)_ Add server image publishing in release workflow

### 🐛 Bug Fixes

- _(cli/release)_ Show tag preview before confirmation prompts, not just in
  dry-run

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.11-test

## [0.0.11-test] - 2026-07-25

### 🐛 Bug Fixes

- _(workflow)_ Let run: steps' ens subcommands find the repo root
- _(workflows/server)_ Use ens bin instead of task

### ⚙️ Miscellaneous Tasks

- _(changelog)_ Update for 0.0.10-test

## [0.0.10-test] - 2026-07-25

### 🚀 Features

- _(release)_ Name the compiled cli binary ensemble-linux-x64
- Add install.sh for curl-based installation
- _(cli)_ Add ens version command to check and self-update the installed binary

### 🐛 Bug Fixes

- _(workflows/release)_ Retry the changelog push with rebase if main moved

### 📚 Documentation

- Add installation section to README

## [0.0.9-test] - 2026-07-25

### 🐛 Bug Fixes

- _(workflows/release)_ Wire gh as git credential helper so the changelog push
  authenticates

## [0.0.8-test] - 2026-07-25

### 🐛 Bug Fixes

- _(workflows/release)_ Pin git-cliff to 2.13.1, download via wget instead of
  curl pipe

## [0.0.7-test] - 2026-07-25

### 🐛 Bug Fixes

- _(workflows/release)_ Install git-cliff from release tarball, not broken
  installer script

## [0.0.5-test] - 2026-07-25

### 🐛 Bug Fixes

- _(workflow)_ Give each run a fresh scratch cwd instead of reusing workflowDir
- _(release)_ Create tag only after all prompts are answered

## [0.0.4-test] - 2026-07-25

### 🐛 Bug Fixes

- _(ship/server)_ Add curl in docker image

## [0.0.3-test] - 2026-07-25

### 🚀 Features

- _(ship/server)_ Add git and gh cli
- _(workflows)_ Add ensemble server recipe to ease manual updates
- _(schemas)_ Add json schema for workflow.yml
- _(workflow)_ Add --remote flag and workflow remote configure for remote
  triggering
- _(workflow)_ Add remote upload command using the existing registry endpoint
- _(platform)_ Replace per-feature bearer tokens with .ensemble/tokens.json
  permissions
- _(workflows)_ Add release workflow

### 💼 Other

- _(workflows)_ Move ensemble server recipe to just server folder since ensemble
  is already the whole proejct

## [0.0.2-test] - 2026-07-24

### 🚀 Features

- _(pack)_ Add deno.compile pack kit, envs/pack/<ship>.env support

### 🐛 Bug Fixes

- _(pack)_ Let -o/--output-name override compile.yml's output field
- _(pack)_ Add packages build context

### 🚜 Refactor

- _(workflow)_ Flatten github trigger's event.push to push

## [0.0.1-test] - 2026-07-24

### 🚀 Features

- _(workflow)_ Add @ensemble/workflow CI-style pipeline engine with matrix jobs
- _(cli)_ Add ens init to scaffold a new project by vendoring ensemble
- _(platform)_ Add server platform with trigger-workflow feature
- _(workflow)_ Add on: triggers (http, github push-tags) with trigger.* context
- _(ship/server)_ Add server ship image with mandatory trigger authentication
- _(platform)_ Add workflow-registry feature for tar.gz upload to
  workflows/<name>
- _(cli)_ Add --output-name flag to pack for separate ship output naming
- _(cli)_ Add ens config set-build-kit command
- _(cli)_ Add ens release command (next/set/undo)
- _(ship/server)_ Add md guide, use /workspace as workdir
- _(release)_ Prompt to push commits+tag, warn on uncommitted changes before
  tagging

### 🐛 Bug Fixes

- _(core/release)_ Drop v prefix from release tags
- _(core/releases)_ Use h3 for version number heading
- _(cli/release)_ Hoist --dry-run/-p/-m/-r to global options shown on all
  subcommands

### 🚜 Refactor

- _(release)_ Remove changelog generation, tag creation only

### ⚙️ Miscellaneous Tasks

- Init
- Formatting
