import * as vscode from "vscode";
import { basename, dirname } from "node:path";

const DEPLOY = /^deploy:/;
const RELEASE = /^release:/;

/**
 * Actions above a delivery manifest's top-level blocks: develop and deploy
 * above `deploy:` (they act on this workload), and release above `release:` —
 * once, not per ship, because `ens release` packs and publishes every
 * workload's releases together, all or nothing.
 */
export class DeliveryLenses implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const workload = basename(dirname(document.uri.fsPath));
    const lenses: vscode.CodeLens[] = [];

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      const range = new vscode.Range(line, 0, line, 0);
      if (DEPLOY.test(text)) {
        lenses.push(
          new vscode.CodeLens(range, { title: "$(play) Develop", command: "ensemble.develop", arguments: [workload] }),
          new vscode.CodeLens(range, { title: "$(cloud-upload) Deploy…", command: "ensemble.deploy", arguments: [workload] }),
        );
      }
      if (RELEASE.test(text)) {
        lenses.push(
          new vscode.CodeLens(range, { title: "$(tag) Release…", command: "ensemble.release", arguments: [] }),
        );
      }
    }
    return lenses;
  }
}
