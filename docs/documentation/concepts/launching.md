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

> Status: the manifest section is parsed and validated. Starting launch entries is not built yet.
