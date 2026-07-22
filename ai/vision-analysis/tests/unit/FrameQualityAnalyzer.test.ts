import { describe, expect, it } from "vitest";

import { FrameQualityAnalyzer } from "../../src/vision/core/FrameQualityAnalyzer.js";

function createImageData(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

describe("FrameQualityAnalyzer", () => {
  const analyzer = new FrameQualityAnalyzer({
    faceRoiPaddingRatio: 0,
    blurVarianceFloor: 20,
    blurVarianceCeiling: 300,
  });

  it("maps mean luminance to a brightness score", () => {
    const result = analyzer.analyze(createImageData(8, 8, () => 128), null);

    expect(result.brightnessScore).toBeCloseTo(128 / 255, 6);
    expect(result.blurScore).toBe(0);
  });

  it("gives high-frequency edges a higher sharpness score", () => {
    const flat = analyzer.analyze(createImageData(8, 8, () => 128), null);
    const checkerboard = analyzer.analyze(
      createImageData(8, 8, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)),
      null,
    );

    expect(checkerboard.rawLaplacianVariance).toBeGreaterThan(
      flat.rawLaplacianVariance,
    );
    expect(checkerboard.blurScore).toBeGreaterThan(flat.blurScore);
  });
});

