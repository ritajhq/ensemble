import type { AnyHandler, Handler } from "./handler.ts";
import type { Kind } from "./kind.ts";

/**
 * Routes a (target, kind) pair to the `Handler` a deploy kit registered for
 * it — the one mechanism both compute kinds and every resource kind go
 * through, since `Kind` already spans both (see kind.ts). `Target` is left
 * generic rather than a fixed union: it's whatever set of deploy targets the
 * calling kit declares (e.g. "compose" | "kubernetes" | "aws"), not
 * something this SDK enumerates itself.
 */
export class Router<Target extends string> {
  private readonly handlers = new Map<Target, Map<Kind, AnyHandler>>();

  /** Registers `handler` for `(target, kind)`. Throws if that pair is already registered — a kit registering the same pair twice is a bug in the kit, not a valid override. */
  Register<TSpec>(target: Target, kind: Kind, handler: Handler<TSpec>): void {
    let byKind = this.handlers.get(target);
    if (!byKind) {
      byKind = new Map();
      this.handlers.set(target, byKind);
    }
    if (byKind.has(kind)) {
      throw new Error(
        `A handler for (target: "${target}", kind: "${kind}") is already registered.`,
      );
    }
    byKind.set(kind, handler as AnyHandler);
  }

  /** Returns the handler registered for `(target, kind)`, or undefined if this target doesn't support that kind. */
  Resolve<TSpec>(target: Target, kind: Kind): Handler<TSpec> | undefined {
    return this.handlers.get(target)?.get(kind) as Handler<TSpec> | undefined;
  }

  /** Every kind `target` has a registered handler for. */
  SupportedKinds(target: Target): Kind[] {
    return [...(this.handlers.get(target)?.keys() ?? [])];
  }
}
