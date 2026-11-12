# Upstream

A vendored slice of [Fumadocs](https://github.com/fuma-nama/fumadocs) (MIT,
see `LICENSE`), so the docs site can use its layout without Next.js or Vite.

- Forked from: `fumadocs-ui@16.10.3`, commit `b308a19caef541632d727e8935084b6e7968b344`
- `ui/` — from `packages/radix-ui/src` (published as `fumadocs-ui`): the docs
  layout and the files it imports, nothing else.
- `core/` — from `packages/core/src` (`fumadocs-core`): only the modules `ui/` uses.
- `css/` — `base.css`, `shiki.css` and `default-colors.css` from
  `packages/radix-ui/css/lib`.

## Local changes

- Package imports (`fumadocs-core/*`, the `@/` alias) rewritten to relative paths.
- Search deferred: the default search dialog is not vendored, `SearchProvider`
  requires a `SearchDialog`, and `RootProvider` mounts search only when one is given.
- `core/framework`: dropped the `next/dist` image type; `src` is a `string`.
- `adapters/static.tsx` (new): a framework adapter for sites without a client router.
- Not vendored: the typography plugin (Tailwind's standalone CLI can't load its
  npm dependencies) and `css/generated/*` (class lists only needed when the UI
  sits in `node_modules`; Tailwind scans this folder directly instead).

To sync: re-run the slice against a newer tag and re-apply the changes above.
