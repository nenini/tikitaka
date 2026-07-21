import { describe, expect, it } from "vitest";

import { estimateHeadPose } from "../../src/vision/core/HeadPoseEstimator.js";
import type { FacialTransformMatrix } from "../../src/vision/core/LandmarkerFrameResult.js";

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function createRotationMatrix(
  yawDegrees: number,
  pitchDegrees: number,
  rollDegrees: number,
): FacialTransformMatrix {
  const yaw = degreesToRadians(yawDegrees);
  const pitch = degreesToRadians(pitchDegrees);
  const roll = degreesToRadians(rollDegrees);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);

  // Row-major Rz(roll) * Ry(yaw) * Rx(pitch).
  return {
    rows: 4,
    columns: 4,
    data: [
      cz * cy,
      cz * sy * sx - sz * cx,
      cz * sy * cx + sz * sx,
      0,
      sz * cy,
      sz * sy * sx + cz * cx,
      sz * sy * cx - cz * sx,
      0,
      -sy,
      cy * sx,
      cy * cx,
      0,
      0,
      0,
      0,
      1,
    ],
  };
}

describe("estimateHeadPose", () => {
  it("extracts yaw, pitch, and roll from a synthetic matrix", () => {
    const pose = estimateHeadPose(createRotationMatrix(12, 7, -4));

    expect(pose?.yaw).toBeCloseTo(12, 6);
    expect(pose?.pitch).toBeCloseTo(7, 6);
    expect(pose?.roll).toBeCloseTo(-4, 6);
  });

  it("returns null for an invalid transform", () => {
    expect(
      estimateHeadPose({ rows: 3, columns: 3, data: [1, 0, 0] }),
    ).toBeNull();
  });
});

