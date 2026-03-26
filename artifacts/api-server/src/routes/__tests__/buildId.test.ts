import { describe, expect, it } from "vitest";
import { parseBuildIdParam } from "../buildId.js";

describe("parseBuildIdParam", () => {
  it("parses numeric string route params", () => {
    expect(parseBuildIdParam("42")).toBe(42);
  });

  it("rejects invalid or repeated route params", () => {
    expect(parseBuildIdParam("abc")).toBeNull();
    expect(parseBuildIdParam(["42"])).toBeNull();
    expect(parseBuildIdParam(undefined)).toBeNull();
  });
});
