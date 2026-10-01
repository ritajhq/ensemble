import { createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ReferenceCompletion } from "./reference-completion.ts";
import { Workloads } from "./workloads.ts";

/** Serves editor support for Ensemble's own files (today: `ci/<name>/delivery.yml` reference completion) over the Language Server Protocol on stdio, for any LSP client — the VS Code extension being one. */
export class Server {
  private readonly connection = createConnection(ProposedFeatures.all);
  private readonly documents = new TextDocuments(TextDocument);
  private readonly workloads = new Workloads();
  private readonly completion = new ReferenceCompletion();

  Start(): void {
    this.connection.onInitialize(() => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { triggerCharacters: ["{", "."] },
      },
    }));

    this.documents.onDidChangeContent(({ document }) => this.workloads.update(document.uri, document.getText()));
    this.documents.onDidClose(({ document }) => this.workloads.forget(document.uri));

    this.connection.onCompletion(({ textDocument, position }) => {
      const document = this.documents.get(textDocument.uri);
      if (!document) return [];
      return this.completion.complete(document.getText(), position, this.workloads.of(document.uri));
    });

    this.documents.listen(this.connection);
    this.connection.listen();
  }
}
