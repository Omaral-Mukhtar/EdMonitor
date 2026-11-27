import { parse, type MathNode } from "mathjs";

export type MathVariable = "x" | "y";

export class MathExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MathExpressionError";
  }
}

const MAX_EXPRESSION_LENGTH = 200;
const MAX_AST_DEPTH = 32;

const ALLOWED_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (a) => Math.sin(a),
  cos: (a) => Math.cos(a),
  tan: (a) => Math.tan(a),
  sec: (a) => 1 / Math.cos(a),
  csc: (a) => 1 / Math.sin(a),
  cot: (a) => 1 / Math.tan(a),
  asin: (a) => Math.asin(a),
  acos: (a) => Math.acos(a),
  atan: (a) => Math.atan(a),
  sinh: (a) => Math.sinh(a),
  cosh: (a) => Math.cosh(a),
  tanh: (a) => Math.tanh(a),
  sqrt: (a) => Math.sqrt(a),
  cbrt: (a) => Math.cbrt(a),
  abs: (a) => Math.abs(a),
  log: (a) => Math.log(a),
  ln: (a) => Math.log(a),
  exp: (a) => Math.exp(a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  sign: (a) => Math.sign(a),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
};

const ALLOWED_UNARY_OPS = new Set(["+", "-"]);
const ALLOWED_BINARY_OPS = new Set(["+", "-", "*", "/", "^"]);

type CompiledAstNode =
  | { kind: "const"; value: number }
  | { kind: "var" }
  | { kind: "unary"; op: "+" | "-"; arg: CompiledAstNode }
  | {
      kind: "binary";
      op: "+" | "-" | "*" | "/" | "^";
      left: CompiledAstNode;
      right: CompiledAstNode;
    }
  | { kind: "call"; fn: (...args: number[]) => number; args: CompiledAstNode[] };

function compileAstNode(
  node: MathNode,
  variable: MathVariable,
  depth: number
): CompiledAstNode {
  if (depth > MAX_AST_DEPTH) {
    throw new MathExpressionError("Expression exceeds maximum AST depth.");
  }

  switch (node.type) {
    case "ConstantNode": {
      const val = (node as unknown as { value: unknown }).value;
      const num = typeof val === "bigint" ? Number(val) : val;
      if (typeof num !== "number" || !Number.isFinite(num)) {
        throw new MathExpressionError("Only finite numeric literals are allowed.");
      }
      return { kind: "const", value: num };
    }

    case "SymbolNode": {
      const name = (node as unknown as { name: string }).name;
      if (name === variable) {
        return { kind: "var" };
      }
      if (Object.prototype.hasOwnProperty.call(ALLOWED_CONSTANTS, name)) {
        return { kind: "const", value: ALLOWED_CONSTANTS[name] };
      }
      throw new MathExpressionError(
        `Disallowed symbol '${name}' for variable '${variable}'.`
      );
    }

    case "ParenthesisNode": {
      const content = (node as unknown as { content: MathNode }).content;
      return compileAstNode(content, variable, depth + 1);
    }

    case "OperatorNode": {
      const opNode = node as unknown as {
        op: string;
        fn: string;
        args: MathNode[];
      };
      if (opNode.args.length === 1 && ALLOWED_UNARY_OPS.has(opNode.op)) {
        return {
          kind: "unary",
          op: opNode.op as "+" | "-",
          arg: compileAstNode(opNode.args[0], variable, depth + 1),
        };
      }
      if (opNode.args.length === 2 && ALLOWED_BINARY_OPS.has(opNode.op)) {
        return {
          kind: "binary",
          op: opNode.op as "+" | "-" | "*" | "/" | "^",
          left: compileAstNode(opNode.args[0], variable, depth + 1),
          right: compileAstNode(opNode.args[1], variable, depth + 1),
        };
      }
      throw new MathExpressionError(
        `Disallowed operator '${opNode.op}' (${opNode.fn}).`
      );
    }

    case "FunctionNode": {
      const fnNode = node as unknown as { fn: MathNode; args: MathNode[] };
      if (fnNode.fn.type !== "SymbolNode") {
        throw new MathExpressionError("Dynamic function calls are not allowed.");
      }
      const fnName = (fnNode.fn as unknown as { name: string }).name;
      if (!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCTIONS, fnName)) {
        throw new MathExpressionError(`Disallowed function '${fnName}'.`);
      }
      if (fnNode.args.length === 0) {
        throw new MathExpressionError(
          `Function '${fnName}' requires at least 1 argument.`
        );
      }
      if (fnName !== "min" && fnName !== "max" && fnNode.args.length !== 1) {
        throw new MathExpressionError(
          `Function '${fnName}' accepts exactly 1 argument.`
        );
      }
      return {
        kind: "call",
        fn: ALLOWED_FUNCTIONS[fnName],
        args: fnNode.args.map((arg) => compileAstNode(arg, variable, depth + 1)),
      };
    }

    default:
      throw new MathExpressionError(`Disallowed AST node type '${node.type}'.`);
  }
}

function evalCompiledNode(node: CompiledAstNode, value: number): number {
  switch (node.kind) {
    case "const":
      return node.value;
    case "var":
      return value;
    case "unary": {
      const v = evalCompiledNode(node.arg, value);
      return node.op === "-" ? -v : v;
    }
    case "binary": {
      const left = evalCompiledNode(node.left, value);
      const right = evalCompiledNode(node.right, value);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? Number.NaN : left / right;
        case "^":
          return Math.pow(left, right);
      }
    }
    case "call": {
      const argValues = node.args.map((arg) => evalCompiledNode(arg, value));
      return node.fn(...argValues);
    }
  }
}

/**
 * Parses and validates a math expression against a strict AST allowlist before
 * returning a pure evaluator `(t: number) => number`.
 */
export function compileMathExpression(
  expression: string,
  variable: MathVariable
): (value: number) => number {
  if (typeof expression !== "string") {
    throw new MathExpressionError("Expression must be a string.");
  }
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new MathExpressionError("Expression cannot be empty.");
  }
  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    throw new MathExpressionError("Expression exceeds maximum length.");
  }

  let root: MathNode;
  try {
    root = parse(trimmed);
  } catch (err) {
    throw new MathExpressionError(
      err instanceof Error ? err.message : "Failed to parse math expression."
    );
  }

  const compiled = compileAstNode(root, variable, 0);
  return (value: number): number => {
    if (!Number.isFinite(value)) {
      return Number.NaN;
    }
    const result = evalCompiledNode(compiled, value);
    return Number.isFinite(result) ? result : Number.NaN;
  };
}

/**
 * Convenience helper to validate an expression string without keeping the compiled closure.
 */
export function isValidMathExpression(
  expression: string,
  variable: MathVariable
): boolean {
  try {
    compileMathExpression(expression, variable);
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluate an expression once at `value`. Throws `MathExpressionError` if expression is unsafe/invalid.
 */
export function evaluateMathExpression(
  expression: string,
  variable: MathVariable,
  value: number
): number {
  const fn = compileMathExpression(expression, variable);
  return fn(value);
}
