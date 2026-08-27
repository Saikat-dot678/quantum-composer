import { describe, expect, it } from "vitest";
import { parseParameterExpression } from "./parameterExpression";

describe("parameter expressions", () => {
  it.each([["pi", Math.PI], ["π/2", Math.PI / 2], ["-3*pi/4", -3 * Math.PI / 4], ["2^(1+2)", 8]])("parses %s", (text, expected) => {
    expect(parseParameterExpression(text)).toBeCloseTo(expected as number, 12);
  });
  it.each(["alert(1)", "pi//2", "1/0", "", "2 2"])("rejects %s", (text) => expect(() => parseParameterExpression(text)).toThrow());
});
