import { describe, expect, it } from "vitest";
import { ottoVersion } from "./index.js";

describe("otto", () => {
  it("returns version string", () => {
    expect(ottoVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
