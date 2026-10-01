import { Command } from "@cliffy/command";
import * as Lsp from "../lsp/index.ts";

export const lspCommand = new Command()
  .name("lsp")
  .description("Run a language server for Ensemble's files (e.g. ci/<name>/delivery.yml) over stdio, for an editor's LSP client.")
  .option("--stdio", "Use stdio transport (the only one supported; accepted for LSP client compatibility).")
  .action(() => {
    new Lsp.Server().Start();
  });
