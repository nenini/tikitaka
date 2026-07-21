import { describe, expect, it } from "vitest";

import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { visionConfigSchema } from "../../src/vision/config/VisionConfig.js";

describe("visionConfigSchema", () => {
  it("accepts the default configuration", () => {
    expect(visionConfigSchema.parse(defaultVisionConfig)).toEqual(
      defaultVisionConfig,
    );
  });

  it("requires FaceQualityDetector in every performance profile", () => {
    const invalidConfig = structuredClone(defaultVisionConfig);
    invalidConfig.profiles.LOW.enabledDetectors = ["SCREEN_ATTENTION"];

    expect(() => visionConfigSchema.parse(invalidConfig)).toThrow(
      /FACE_QUALITY/,
    );
  });

  it("rejects invalid hysteresis thresholds", () => {
    const invalidConfig = structuredClone(defaultVisionConfig);
    invalidConfig.screenAttention.yawRecoveryDegrees =
      invalidConfig.screenAttention.yawEntryDegrees;

    expect(() => visionConfigSchema.parse(invalidConfig)).toThrow(
      /recovery threshold/,
    );
  });

  it("keeps nod disabled by default until empirical tuning is complete", () => {
    expect(defaultVisionConfig.nod.enabledByDefault).toBe(false);
  });
});

