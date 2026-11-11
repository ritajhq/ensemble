# Ensemble

This repository is an `ens` project that builds `ens` itself.

- Load the `ensemble` skill (`.claude/skills/ensemble`) for the workspace
  layout, the CLI and the rules of an `ens` project.
- [CONTRIBUTING.md](../CONTRIBUTING.md) is binding for any change here: where code
  lives, how to run and check it, code conventions, docs upkeep and the commit
  format.
- [docs/documentation](../docs/documentation) is the user manual and the source of
  truth for behaviour. A change to behaviour updates its page in the same
  commit.

Quick reference (no `deno.json` at the root):

```sh
deno task --config .ensemble/ecosystems/deno/deno.json cli <command> ...   # run ens from source
deno fmt|lint|check|test --config .ensemble/ecosystems/deno/deno.json <files>
```

Commit messages are one Conventional Commits summary line, with no body and no
trailers.
