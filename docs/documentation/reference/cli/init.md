# `ens init`

Scaffold a new Ensemble project.

```sh
ens init [name]
ens init my-tool --ecosystem cargo
```

Prompts for a project name if none is given, then creates a folder of that name
in the current directory, lays down the layout described in
[Workspace layout](../../concepts/workspace-layout.md), fetches the built-in
kits, and initializes a git repository in it.

- `--ecosystem <name>` — a language the project uses: an ecosystem kit's name,
  or the built-in `deno`. Repeat for several; the first is the default for new
  libraries. Default: `deno`.
- `--kits-from <url>` — fetch the kits from this git repository, optionally
  `<url>@<ref>`, instead of ensemble's own at this `ens`'s version.

If a folder with that name already exists, `ens init` stops and changes nothing.

## What it creates

For a project named `my-project`:

```
my-project/
├── .git/
├── .ensemble/
│   ├── .gitignore               # per-developer state: config.local.yaml, release state, rendered deploys
│   ├── config.yaml              # which kit builds each app and packs each ship (starts as comments)
│   └── kits/                    # the built-in kits, fetched (see below)
│       ├── build/
│       ├── pack/
│       ├── deploy/
│       ├── lib/
│       └── ecosystem/
├── source/
│   ├── deno.json                # or Cargo.toml: each ecosystem's root files live here
│   ├── apps/                    # one folder per app
│   ├── core/                    # shared code that speaks this project's domain
│   ├── libs/                    # shared code generic enough for other projects
│   ├── ship/                    # packaging inputs, such as Dockerfiles
│   ├── envs/
│   │   ├── build/               # default build variables, <app>.env
│   │   └── pack/                # default pack variables, <ship>.env
│   └── artifacts/
│       └── .gitignore           # ignores build output, keeps deploy/
├── ci/                          # delivery manifests, ci/<name>/delivery.yml
├── docs/                        # the project's documentation
└── README.md                    # the layout and the commands, with the project's name
```

Every folder under `source/`, plus `ci/` and `docs/`, starts empty. Git doesn't
track empty folders, so they appear in the repository as you add files to them.
`source/integrations/` isn't created: add it when an app needs one, as described
in [Workspace layout](../../concepts/workspace-layout.md).

### The kits

`.ensemble/kits/` holds a copy of the built-in kits, so the project owns the
versions it builds, packs and deploys with:

| Role   | Kits                               |
| ------ | ---------------------------------- |
| build  | `deno.bundle`, `react`             |
| pack   | `deno.compile`, `docker`, `vscode` |
| deploy | `aws`, `cloudflare`, `compose`     |
| lib    | `jsr`                              |

They come from the `ens` release you ran: `ens init` fetches the kits at the git
tag of its own version, so they match the CLI that created them. A development
build of `ens` with no release version fetches `main` instead. Fetching needs
network access to GitHub, and `git` on your `PATH`.

## Next steps

```sh
cd my-project
ens app create <kit> <name>   # scaffold the first app, e.g. `ens app create react web`
ens build <name>              # build it
```

The generated `README.md` lists the rest of the commands.
