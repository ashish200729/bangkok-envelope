import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "./index";

describe("engine", () => {
  it("exposes a semver version for stamping saved results", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
