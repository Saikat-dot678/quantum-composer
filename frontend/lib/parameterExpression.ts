/** Safe arithmetic parser for gate angles. Supports pi/π, + - * / ^ and parentheses. */
export function parseParameterExpression(source: string): number {
  if (source.length > 128) throw new Error("Expression is too long.");
  const tokens = source.replaceAll("π", "pi").match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|pi|[()+\-*/^]/gi) ?? [];
  if (tokens.join("").toLowerCase() !== source.replace(/\s+/g, "").replaceAll("π", "pi").toLowerCase()) {
    throw new Error("Use numbers, pi (π), parentheses, and + − * / ^ only.");
  }
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const primary = (): number => {
    const token = take();
    if (token === "(") {
      const value = sum();
      if (take() !== ")") throw new Error("Missing closing parenthesis.");
      return value;
    }
    if (token?.toLowerCase() === "pi") return Math.PI;
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Expected a finite number or pi.");
    return value;
  };
  const unary = (): number => peek() === "+" ? (take(), unary()) : peek() === "-" ? (take(), -unary()) : primary();
  const power = (): number => { const left = unary(); return peek() === "^" ? (take(), left ** power()) : left; };
  const product = (): number => {
    let value = power();
    while (peek() === "*" || peek() === "/") { const op = take(); const rhs = power(); value = op === "*" ? value * rhs : value / rhs; }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") { const op = take(); const rhs = product(); value = op === "+" ? value + rhs : value - rhs; }
    return value;
  };
  if (!tokens.length) throw new Error("Enter an angle, such as pi/2.");
  const value = sum();
  if (index !== tokens.length) throw new Error(`Unexpected token "${tokens[index]}".`);
  if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error("Expression must evaluate to a finite, reasonably sized number.");
  return value;
}
