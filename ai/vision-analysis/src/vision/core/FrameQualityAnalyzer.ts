import type { NormalizedFaceBox } from "./NormalizedFaceFrame.js";

export interface FrameQualityAnalyzerOptions {
  readonly faceRoiPaddingRatio: number;
  readonly blurVarianceFloor: number;
  readonly blurVarianceCeiling: number;
}

export interface FrameImageQuality {
  readonly brightnessScore: number;
  readonly backgroundBrightnessScore: number;
  readonly backlightScore: number;
  readonly blurScore: number;
  readonly rawLaplacianVariance: number;
}

interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Computes privacy-safe scalar quality signals and retains no pixel data. */
export class FrameQualityAnalyzer {
  constructor(private readonly options: FrameQualityAnalyzerOptions) {
    if (
      options.blurVarianceCeiling <= options.blurVarianceFloor ||
      options.faceRoiPaddingRatio < 0
    ) {
      throw new RangeError("invalid frame quality analyzer options");
    }
  }

  analyze(
    imageData: ImageData,
    faceBox: NormalizedFaceBox | null,
  ): FrameImageQuality {
    const bounds = this.toPixelBounds(imageData, faceBox);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) {
      return {
        brightnessScore: 0,
        backgroundBrightnessScore: 0,
        backlightScore: 0,
        blurScore: 0,
        rawLaplacianVariance: 0,
      };
    }

    const luminance = new Float32Array(width * height);
    let luminanceSum = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceX = bounds.left + x;
        const sourceY = bounds.top + y;
        const sourceIndex = (sourceY * imageData.width + sourceX) * 4;
        const red = imageData.data[sourceIndex] ?? 0;
        const green = imageData.data[sourceIndex + 1] ?? 0;
        const blue = imageData.data[sourceIndex + 2] ?? 0;
        const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        luminance[y * width + x] = value;
        luminanceSum += value;
      }
    }

    const brightnessScore = clamp(
      luminanceSum / luminance.length / 255,
      0,
      1,
    );
    let backgroundSum = 0;
    let backgroundCount = 0;
    if (faceBox !== null) {
      for (let y = 0; y < imageData.height; y += 1) {
        for (let x = 0; x < imageData.width; x += 1) {
          if (
            x >= bounds.left &&
            x < bounds.right &&
            y >= bounds.top &&
            y < bounds.bottom
          ) {
            continue;
          }
          const index = (y * imageData.width + x) * 4;
          backgroundSum +=
            0.2126 * (imageData.data[index] ?? 0) +
            0.7152 * (imageData.data[index + 1] ?? 0) +
            0.0722 * (imageData.data[index + 2] ?? 0);
          backgroundCount += 1;
        }
      }
    }
    const backgroundBrightnessScore =
      backgroundCount === 0
        ? brightnessScore
        : clamp(backgroundSum / backgroundCount / 255, 0, 1);
    // Only a brighter background than face ROI is treated as backlight evidence.
    const backlightScore =
      faceBox === null
        ? 1
        : clamp(
            1 -
              Math.max(0, backgroundBrightnessScore - brightnessScore) / 0.45,
            0,
            1,
          );
    const rawLaplacianVariance = this.laplacianVariance(
      luminance,
      width,
      height,
    );
    const blurScore = clamp(
      (rawLaplacianVariance - this.options.blurVarianceFloor) /
        (this.options.blurVarianceCeiling - this.options.blurVarianceFloor),
      0,
      1,
    );

    return {
      brightnessScore,
      backgroundBrightnessScore,
      backlightScore,
      blurScore,
      rawLaplacianVariance,
    };
  }

  private toPixelBounds(
    imageData: ImageData,
    faceBox: NormalizedFaceBox | null,
  ): PixelBounds {
    if (faceBox === null) {
      return {
        left: 0,
        top: 0,
        right: imageData.width,
        bottom: imageData.height,
      };
    }

    const paddingX =
      (faceBox.right - faceBox.left) * this.options.faceRoiPaddingRatio;
    const paddingY =
      (faceBox.bottom - faceBox.top) * this.options.faceRoiPaddingRatio;

    return {
      left: Math.floor(
        clamp(faceBox.left - paddingX, 0, 1) * imageData.width,
      ),
      top: Math.floor(
        clamp(faceBox.top - paddingY, 0, 1) * imageData.height,
      ),
      right: Math.ceil(
        clamp(faceBox.right + paddingX, 0, 1) * imageData.width,
      ),
      bottom: Math.ceil(
        clamp(faceBox.bottom + paddingY, 0, 1) * imageData.height,
      ),
    };
  }

  private laplacianVariance(
    luminance: Float32Array,
    width: number,
    height: number,
  ): number {
    if (width < 3 || height < 3) {
      return 0;
    }

    let sum = 0;
    let squaredSum = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const center = luminance[y * width + x] ?? 0;
        const value =
          (luminance[(y - 1) * width + x] ?? 0) +
          (luminance[(y + 1) * width + x] ?? 0) +
          (luminance[y * width + x - 1] ?? 0) +
          (luminance[y * width + x + 1] ?? 0) -
          4 * center;
        sum += value;
        squaredSum += value * value;
        count += 1;
      }
    }

    const mean = sum / count;
    return squaredSum / count - mean * mean;
  }
}
