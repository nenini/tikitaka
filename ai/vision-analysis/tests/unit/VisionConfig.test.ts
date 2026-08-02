import { describe, expect, it } from "vitest";

import { defaultVisionConfig } from "../../src/vision/config/defaultVisionConfig.js";
import { visionConfigSchema } from "../../src/vision/config/VisionConfig.js";

describe("visionConfigSchema", () => {
  it("accepts the default configuration", () => {
    expect(visionConfigSchema.parse(defaultVisionConfig)).toEqual(
      defaultVisionConfig,
    );
    expect(defaultVisionConfig.schemaVersion).toBe(2);
  });

  it("rejects the previous configuration schema version", () => {
    expect(() =>
      visionConfigSchema.parse({
        ...defaultVisionConfig,
        schemaVersion: 1,
      }),
    ).toThrow();
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

  it("uses a dedicated 0.15 baseline cutoff for smile-prompt suppression", () => {
    expect(defaultVisionConfig.smile.baselinePromptSuppressionScore).toBe(0.15);
    expect(defaultVisionConfig.smile.subtleAbsoluteScore).toBe(0.2);
  });
});
