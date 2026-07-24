import { data, Evaluator, ExpressionError, ExpressionEvaluationError, Lexer, Parser } from "@actions/expressions";

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
