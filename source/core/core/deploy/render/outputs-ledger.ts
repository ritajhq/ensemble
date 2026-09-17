/** Raised when something asks the ledger for an entry that was never recorded — a resource the `Renderer` hasn't reached yet in dependency order, or one that doesn't exist. Should never happen once `DependencyGraph`/`ReferenceValidator` have already run; a `Renderer` bug if it does. */
export class OutputsLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputsLedgerError";
  }
}

/**
 * What every already-rendered resource in this run produced, filled in as the
 * `Renderer` walks resources in dependency order (Section 8) — the whole
 * reason resolution is ordered at all: a later resource's reference can only
 * be resolved once its target's entry is here.
 */
export class OutputsLedger {
  private readonly types = new Map<string, string>();
  private readonly outputs = new Map<
    string,
    Readonly<Record<string, unknown>>
  >();
  private readonly releaseOutputs = new Map<string, unknown>();

  record(
    category: string,
    name: string,
    type: string,
    outputs: Readonly<Record<string, unknown>>,
  ): void {
    const key = this.key(category, name);
    this.types.set(key, type);
    this.outputs.set(key, outputs);
  }

  recordRelease(name: string, value: unknown): void {
    this.releaseOutputs.set(name, value);
  }

  typeOf(category: string, name: string): string {
    const type = this.types.get(this.key(category, name));
    if (type === undefined) {
      throw new OutputsLedgerError(
        `No type recorded for "${category}.${name}" — it hasn't been rendered yet.`,
      );
    }
    return type;
  }

  outputFor(category: string, name: string, output: string): unknown {
    const outputs = this.outputs.get(this.key(category, name));
    if (outputs === undefined) {
      throw new OutputsLedgerError(
        `No outputs recorded for "${category}.${name}" — it hasn't been rendered yet.`,
      );
    }
    if (!(output in outputs)) {
      throw new OutputsLedgerError(
        `"${category}.${name}" has no output "${output}".`,
      );
    }
    return outputs[output];
  }

  releaseOutput(name: string): unknown {
    if (!this.releaseOutputs.has(name)) {
      throw new OutputsLedgerError(
        `No locator recorded for release "${name}" — it hasn't been rendered yet.`,
      );
    }
    return this.releaseOutputs.get(name);
  }

  private key(category: string, name: string): string {
    return `${category}.${name}`;
  }
}
