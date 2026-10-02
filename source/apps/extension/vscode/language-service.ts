import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import type { Cli } from "./cli.ts";

const INSTALL_URL = "https://github.com/ritajhq/ensemble#installation";

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

  /** Starts `ens lsp`; when `ens` is missing or predates the `lsp` command, says so instead of failing activation. */
  async start(): Promise<void> {
    try {
      await this.client.start();
    } catch {
      await this.offerInstall();
    }
  }

  /** Restarts `ens lsp` — e.g. on a newly installed `ens` — or starts it if it never came up (an `ens` that was missing or too old). */
  async restart(): Promise<void> {
    if (!this.client.isRunning()) return await this.start();
    await this.client.restart();
  }

  async stop(): Promise<void> {
    if (!this.client.isRunning()) return;
    await this.client.stop();
  }

  private async offerInstall(): Promise<void> {
    const install = "Install Ensemble";
    const choice = await vscode.window.showErrorMessage(
      "Ensemble's language features need the `ens` CLI, at a version with the `ens lsp` command. Install it, or point the `ensemble.executable` setting at it.",
      install,
    );
    if (choice !== install) return;
    await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
  }
}
