# `ens lsp`

Run a language server for Ensemble's own files over stdio, for an editor's
LSP client.

```sh
ens lsp --stdio
```

`--stdio` is the only transport, and accepted only because LSP clients
conventionally pass it. See [Editor support](../../concepts/editor-support.md)
for what the server provides and how the VS Code extension uses it.
