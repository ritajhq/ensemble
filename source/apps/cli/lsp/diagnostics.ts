import * as Core from "@ensemble/core";
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { SourceMap } from "./source-map.ts";

/**
 * A delivery manifest's problems as editor diagnostics: YAML syntax errors
 * first, since nothing else can be checked past one, then every problem
 * `ens deploy` would find before it needs a kit, each on the node it's about.
 */
export class ManifestDiagnostics {
  constructor(private readonly check = new Core.Deploy.ManifestCheck()) {}

  of(text: string): Diagnostic[] {
    const source = new SourceMap(text);
    const syntax = source.syntaxProblems();
    if (syntax.length > 0) {
      return syntax.map(({ range, message }) =>
        this.diagnostic(range, message)
      );
    }

    try {
      return this.check.problemsOf(text).map((problem) =>
        this.diagnostic(source.rangeOf(problem.path), problem.message)
      );
    } catch (error) {
      // Core's own YAML parser can refuse what the editor's accepted (a
      // duplicate key, say); its message is still the one `ens` would print.
      if (!(error instanceof Error)) throw error;
      return [this.diagnostic(source.rangeOf([]), error.message)];
    }
  }

  private diagnostic(
    range: Diagnostic["range"],
    message: string,
  ): Diagnostic {
    return {
      range,
      message,
      severity: DiagnosticSeverity.Error,
      source: "ens",
    };
  }
}
