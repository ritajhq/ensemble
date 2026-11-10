import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ManifestDiagnostics } from "./diagnostics.ts";
import { ReferenceCompletion } from "./reference-completion.ts";
import { StructureCompletion } from "./structure-completion.ts";
import { Workloads } from "./workloads.ts";

/** Serves editor support for `ci/<name>/delivery.yml` over the Language Server Protocol on stdio, for any LSP client — the VS Code extension being one: completion of references, keys and closed values, and every problem `ens deploy` would find before it needs a kit. */
export class Server {
  private readonly connection = createConnection(ProposedFeatures.all);
  private readonly documents = new TextDocuments(TextDocument);
  private readonly workloads = new Workloads();
  private readonly references = new ReferenceCompletion();
  private readonly structure = new StructureCompletion();
  private readonly diagnostics = new ManifestDiagnostics();

  Start(): void {
    this.connection.onInitialize(() => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { triggerCharacters: ["{", ".", " "] },
      },
    }));

    this.documents.onDidChangeContent(({ document }) => {
      const text = document.getText();
      this.workloads.update(document.uri, text);
      this.connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: this.diagnostics.of(text),
      });
    });
    this.documents.onDidClose(({ document }) => {
      this.workloads.forget(document.uri);
      this.connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    });

    this.connection.onCompletion(({ textDocument, position, context }) => {
      const document = this.documents.get(textDocument.uri);
      if (!document) return [];
      const text = document.getText();
      const references = this.references.complete(
        text,
        position,
        this.workloads.of(document.uri),
      );
      if (references.length > 0) return references;
      return this.structure.complete(
        text,
        position,
        context?.triggerCharacter,
      );
    });

    this.documents.listen(this.connection);
    this.connection.listen();
  }
}
