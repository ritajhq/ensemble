# `ens kit`

Author, install, and manage kits under `.ensemble/kits/`. See
[Authoring a kit](../../guides/authoring-a-kit.md) for the workflow this
command group supports end-to-end.

## `ens kit new <name> <role>`

Scaffold a new kit at `.ensemble/kits/<role>/<name>`.

```sh
ens kit new my-deploy-target deploy
```

`<role>` is one of `build`, `pack`, `deploy`, `lib`.

## `ens kit install <url>`

Clone a kit from a git repository and install it into
`.ensemble/kits/<role>/<name>`.

```sh
ens kit install https://github.com/org/their-kit
ens kit install https://github.com/org/their-kit@v1.2.0   # pinned to a ref
```

## `ens kit eject <name> <remote>`

Push a locally-authored kit to its own repository and register it as a
vendored checkout.

```sh
ens kit eject my-deploy-target git@github.com:org/my-deploy-target.git
```

## `ens kit pin <name> <ref>`

Move an installed kit's checkout to a different ref.

```sh
ens kit pin my-deploy-target v1.3.0
```

## `ens kit update <name> [bump]`

Move an installed kit to its next patch/minor/major tag. `<bump>` is one of
`patch`, `minor`, `major` — defaults to `patch`.

```sh
ens kit update my-deploy-target
ens kit update my-deploy-target minor
```

## `ens kit contribute <name>`

Push an installed kit's local change upstream and open a pull request
against its remote.

```sh
ens kit contribute my-deploy-target
```
