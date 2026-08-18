export interface ContextVariableSummary {
  name: string;
  /** Resolved from contexts/&lt;context&gt;/variables.yml, or workflow.yml's own `value`/`default` when set there instead — undefined if unresolved (no loader entry, no inline value/default). */
  value?: string;
}

/** One declared context.files entry and its committed path, if any. */
export interface ContextFileSummary {
  name: string;
  path: string;
}

export interface ContextValuesSummaryResponse {
  variables: ContextVariableSummary[];
  files: ContextFileSummary[];
}
