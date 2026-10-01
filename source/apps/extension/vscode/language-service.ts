import { LanguageClient } from "vscode-languageclient/node";
import type { Cli } from "./cli.ts";

/** Editor support for Ensemble's files, served by `ens lsp` — the extension only connects VS Code to it. */
export class LanguageService {
  private readonly client: LanguageClient;

  constructor(cli: Cli) {
    this.client = new LanguageClient(
      "ensemble",
      "Ensemble",
      cli.languageServer(),
      { documentSelector: [{ scheme: "file", language: "yaml", pattern: "**/ci/*/{delivery.yml,delivery}" }] },
    );
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }
}
