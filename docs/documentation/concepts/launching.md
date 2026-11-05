# Launching

A delivery manifest's `deploy:` section says what to bring up on a target such as Docker Compose or a cloud. Some
things are not deployed there: a desktop app, a command-line tool, a program you run on your own machine while you
work. The `launch:` section holds those. `ens deploy` ignores it. `ens develop` starts it, after the `deploy:` section,
so a launched thing can use what was deployed.

```yaml
launch:
  kernel:
    type: process
    command: ["${build.kernel}/run"]
    ports: { http: auto }
    envSecrets: { KERNEL_ACCESS_TOKEN: kernel-access-token }
    development:
      restart:
        - build: kernel
  desktop:
    type: desktop
    package: ${pack.desktop}
    env:
      ENSEMBLE_KERNEL_URL: ws://127.0.0.1:${launch.kernel.http}
    envSecrets: { ENSEMBLE_KERNEL_TOKEN: kernel-access-token }
    development:
      restart:
        - pack: desktop
```

## Types

- `process`: a program started from its `command`.
- `desktop`: a desktop app started from the package a pack kit made.

Other types (a mobile app on an emulator, a browser tab) are expected. Each gets the fields its target needs.

## References and order

A value may refer to a build (`${build.<app>}`), a pack (`${pack.<ship>}`), a deploy resource, or another launch entry
(`${launch.<name>.<port>}`). What an entry refers to decides what starts first: the desktop above mentions the
kernel's port, so the kernel starts first. There is no ordering key.

A port set to `auto` is chosen when the launch starts and kept while it runs, so restarting the kernel does not change
the address the desktop was given.

## Changes

`development.restart` names the builds and packs whose output the running thing reads. When one changes, the thing is
restarted. Rebuilding is the build or pack kit's own `--watch`; `ens develop` starts those for what a launch entry names.
A program that can pick up a change without restarting, such as a UI that reloads from disk, does so through its own dev
mode, which the manifest does not describe.

## Running it

`ens develop <name>` brings up the `deploy:` section first, when there is anything to deploy, and then starts the
`launch:` section. A manifest with only `launch:` needs no deploy kit.

Before anything starts, every build and pack the entries use is built once. Then the builds are kept current with their
kits' `--watch`, and so are the packs (a pack kit without a watch is simply packed once). A pack made for a session is
asked for its quick variant: the pack kit receives the variable `profile=debug`.

A server that stops is started again after a pause that grows to sixteen seconds. A `desktop` app that is closed ends the
session, and `Ctrl+C` stops everything, last started first.

A restart rule fires when the named build or pack output changes. A rebuild that rewrites the same files at startup can
cause one extra restart.

Not built yet: references to deploy resources (`${variables.x.value}`) inside a launch entry, and the `mobile` and
`browser` types.
