import { data, Evaluator, ExpressionError, ExpressionEvaluationError, Lexer, Parser } from "@actions/expressions";
import { Binary, ContextAccess, FunctionCall, Grouping, IndexAccess, Literal, Logical, Unary } from "@actions/expressions/ast";

/** Thrown when an expression fails to parse or evaluate (e.g. an unrecognized context path). */
export class WorkflowExpressionError extends Error {}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Converts a plain JS value into the ExpressionData tree the evaluator operates on. */
function toExpressionData(value: JsonValue): data.ExpressionData {
  if (value === null) return new data.Null();
  if (typeof value === "string") return new data.StringData(value);
  if (typeof value === "number") return new data.NumberData(value);
  if (typeof value === "boolean") return new data.BooleanData(value);
  if (Array.isArray(value)) {
    return new data.Array(...value.map(toExpressionData));
  }
  const dict = new data.Dictionary();
  for (const [key, v] of Object.entries(value)) {
    dict.add(key, toExpressionData(v));
  }
  return dict;
}

/** Converts an evaluated ExpressionData result back into a plain JS value. */
export function fromExpressionData(value: data.ExpressionData): JsonValue {
  switch (value.kind) {
    case data.Kind.Null:
      return null;
    case data.Kind.String:
      return (value as data.StringData).value;
    case data.Kind.Number:
      return (value as data.NumberData).value;
    case data.Kind.Boolean:
      return (value as data.BooleanData).value;
    case data.Kind.Array:
      return (value as data.Array).values().map(fromExpressionData);
    default: {
      const dict = value as data.Dictionary;
      const result: Record<string, JsonValue> = {};
      for (const { key, value: v } of dict.pairs()) {
        result[key] = fromExpressionData(v);
      }
      return result;
    }
  }
}

/** GitHub Actions truthiness: only false, 0, NaN, '', and null are falsy. */
function isTruthy(value: data.ExpressionData): boolean {
  switch (value.kind) {
    case data.Kind.Null:
      return false;
    case data.Kind.Boolean:
      return (value as data.BooleanData).value;
    case data.Kind.Number: {
      const n = (value as data.NumberData).value;
      return n !== 0 && !Number.isNaN(n);
    }
    case data.Kind.String:
      return (value as data.StringData).value !== "";
    default:
      return true;
  }
}

/** Strips a single `${{ ... }}` wrapper if present; `if:` allows bare expressions too. */
function unwrap(expr: string): string {
  const trimmed = expr.trim();
  const match = trimmed.match(/^\$\{\{(.*)\}\}$/s);
  return match ? match[1].trim() : trimmed;
}

function reraise(expr: string, error: unknown): never {
  if (error instanceof ExpressionError || error instanceof ExpressionEvaluationError) {
    throw new WorkflowExpressionError(`Invalid expression "${expr}": ${error.message}`);
  }
  throw error;
}

function parseAndEvaluate(expr: string, context: Record<string, JsonValue>): data.ExpressionData {
  const contextNames = Object.keys(context);
  try {
    const lexer = new Lexer(unwrap(expr));
    const { tokens } = lexer.lex();
    const parser = new Parser(tokens, contextNames, []);
    const ast = parser.parse();
    const contextDict = toExpressionData(context) as data.Dictionary;
    const evaluator = new Evaluator(ast, contextDict);
    return evaluator.evaluate();
  } catch (error) {
    reraise(expr, error);
  }
}

/** Evaluates an expression against a context object, returning a plain JS value. */
export function evaluate(expr: string, context: Record<string, JsonValue>): JsonValue {
  return fromExpressionData(parseAndEvaluate(expr, context));
}

/** Evaluates an `if:`-style expression, applying GitHub Actions truthiness rules. */
export function evaluateCondition(expr: string, context: Record<string, JsonValue>): boolean {
  return isTruthy(parseAndEvaluate(expr, context));
}

/**
 * Walks a parsed expression AST to reconstruct a static dotted path (e.g.
 * `steps.checkout.outputs.tag` -> ["steps", "checkout", "outputs", "tag"]),
 * without evaluating against real data. Returns undefined for anything not
 * statically resolvable (e.g. a dynamic index like `steps[someExpr]`) —
 * those are skipped by callers rather than false-flagged.
 */
function extractStaticPath(node: unknown): string[] | undefined {
  if (node instanceof ContextAccess) {
    return [node.name.lexeme];
  }
  if (node instanceof IndexAccess) {
    const base = extractStaticPath(node.expr);
    if (base === undefined) return undefined;
    if (node.index instanceof Literal && node.index.literal instanceof data.StringData) {
      return [...base, node.index.literal.value];
    }
    return undefined;
  }
  return undefined;
}

const EXPR_REF = /\$\{\{(.*?)\}\}/gs;

/**
 * Every top-level context name a workflow expression can ever reference
 * (see context.ts's RootContext/JobContext) — used only to let the parser
 * accept a reference to any of them without throwing "unrecognized
 * named-value"; findStaticStepReferences only cares about `steps.*` paths,
 * ignoring the rest.
 */
const ALL_CONTEXT_NAMES = ["variables", "needs", "matrix", "trigger", "repositories", "steps", "context"];

/**
 * Statically finds every `steps.<id>...` reference inside `text` (e.g. a
 * step's `run:`/`name:`/`if:`), without evaluating anything — for parse-time
 * validation that a referenced step id is real (see parse.ts). Skips
 * anything that doesn't parse or isn't statically resolvable (e.g. a dynamic
 * index like `steps[someExpr]`) rather than throwing; those still fail
 * normally at run time via the existing evaluate()/interpolate() path.
 */
export function findStaticStepReferences(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(EXPR_REF)) {
    try {
      const lexer = new Lexer(unwrap(match[0]));
      const { tokens } = lexer.lex();
      const parser = new Parser(tokens, ALL_CONTEXT_NAMES, []);
      const ast = parser.parse();
      walkForStepReferences(ast, ids);
    } catch {
      // Genuinely malformed, or references a function/context name outside
      // ALL_CONTEXT_NAMES — let the real evaluator surface this at run time.
    }
  }
  return ids;
}

/** Recursively visits every sub-expression, collecting the step id from any statically-resolvable `steps.<id>...` reference found. */
function walkForStepReferences(node: unknown, out: string[]): void {
  if (node instanceof IndexAccess) {
    const path = extractStaticPath(node);
    if (path !== undefined && path.length >= 2 && path[0] === "steps") {
      out.push(path[1]);
      return;
    }
    walkForStepReferences(node.expr, out);
    walkForStepReferences(node.index, out);
    return;
  }
  if (node instanceof Unary) {
    walkForStepReferences(node.expr, out);
    return;
  }
  if (node instanceof Binary) {
    walkForStepReferences(node.left, out);
    walkForStepReferences(node.right, out);
    return;
  }
  if (node instanceof Logical) {
    for (const arg of node.args) walkForStepReferences(arg, out);
    return;
  }
  if (node instanceof Grouping) {
    walkForStepReferences(node.group, out);
    return;
  }
  if (node instanceof FunctionCall) {
    for (const arg of node.args) walkForStepReferences(arg, out);
    return;
  }
}

/** Replaces every `${{ ... }}` occurrence in `text` with its evaluated value (stringified if not already a string). Text with no occurrences passes through unchanged. */
export function interpolate(text: string, context: Record<string, JsonValue>): string {
  return text.replace(EXPR_REF, (match) => {
    const result = evaluate(match, context);
    return typeof result === "string" ? result : JSON.stringify(result);
  });
}
