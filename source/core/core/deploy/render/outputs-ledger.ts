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
  private readonly ports = new Map<string, Readonly<Record<string, unknown>>>();
  private readonly releaseOutputs = new Map<string, unknown>();

  /**
   * `ports` is separate from a provisioner's contract-bound `outputs`
   * (Section 6 of `container-orchestrated.v1`'s own contract comment: a
   * compute's ports are developer-declared data, not a provisioner-produced
   * output) — recording them here rather than folding them into `outputs`
   * keeps `Renderer.validateOutputs`'s strict declared-vs-produced check
   * (an empty `outputs` list) from rejecting them as "extra".
   */
  record(
    category: string,
    name: string,
    type: string,
    outputs: Readonly<Record<string, unknown>>,
    ports: Readonly<Record<string, unknown>> = {},
  ): void {
    const key = this.key(category, name);
    this.types.set(key, type);
    this.outputs.set(key, outputs);
    this.ports.set(key, ports);
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

  /** Whether `category.name` declared a port named `port` — checked before `portFor`, mirroring `ReferenceValidator.hasPort`'s schema-level check of the same data at Phase 2. */
  hasPort(category: string, name: string, port: string): boolean {
    const ports = this.ports.get(this.key(category, name));
    return ports !== undefined && port in ports;
  }

  /** The raw value of a declared port (e.g. the port number) — always the manifest's own literal, never a provisioner-produced value, so never "deferred" the way a contract output can be. */
  portFor(category: string, name: string, port: string): unknown {
    const ports = this.ports.get(this.key(category, name));
    if (ports === undefined) {
      throw new OutputsLedgerError(
        `No outputs recorded for "${category}.${name}" — it hasn't been rendered yet.`,
      );
    }
    if (!(port in ports)) {
      throw new OutputsLedgerError(
        `"${category}.${name}" has no port "${port}".`,
      );
    }
    return ports[port];
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
