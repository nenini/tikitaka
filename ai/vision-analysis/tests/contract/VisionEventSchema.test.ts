import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { visionEventSchema } from "../../src/vision/events/VisionEventSchema.js";

async function readFixture(name: string): Promise<unknown> {
  const contents = await readFile(
    new URL(`../fixtures/${name}`, import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as unknown;
}

describe("visionEventSchema contract fixtures", () => {
  it("accepts the behavior event contract fixture", async () => {
    const fixture = await readFixture("vision-behavior-event.valid.json");

    expect(visionEventSchema.parse(fixture)).toEqual(fixture);
  });

  it("rejects v2 instead of coercing it into the v3 contract", async () => {
    const fixture = await readFixture("vision-behavior-event.valid.json");
    if (typeof fixture !== "object" || fixture === null) {
      throw new TypeError("fixture must be an object");
    }

    expect(() =>
      visionEventSchema.parse({ ...fixture, version: 2 }),
    ).toThrow();
  });

  it("accepts the metric snapshot contract fixture", async () => {
    const fixture = await readFixture("vision-metric-snapshot.valid.json");

    expect(visionEventSchema.parse(fixture)).toEqual(fixture);
  });

  it("rejects raw landmark data at the event envelope", async () => {
    const fixture = await readFixture("vision-event.invalid-raw-data.json");

    expect(() => visionEventSchema.parse(fixture)).toThrow();
  });

  it("rejects detector/source mismatches", async () => {
    const fixture = await readFixture("vision-behavior-event.valid.json");
    if (typeof fixture !== "object" || fixture === null) {
      throw new TypeError("fixture must be an object");
    }

    const invalidFixture = {
      ...fixture,
      source: "SMILE_EXPRESSION_DETECTOR",
    };

    expect(() => visionEventSchema.parse(invalidFixture)).toThrow();
  });

  it("rejects unusable-state reasons on a usable snapshot", async () => {
    const fixture = await readFixture("vision-metric-snapshot.valid.json");
    if (typeof fixture !== "object" || fixture === null) {
      throw new TypeError("fixture must be an object");
    }

    const payload = Reflect.get(fixture, "payload");
    if (typeof payload !== "object" || payload === null) {
      throw new TypeError("fixture payload must be an object");
    }

    const quality = Reflect.get(payload, "quality");
    if (typeof quality !== "object" || quality === null) {
      throw new TypeError("fixture quality must be an object");
    }

    const invalidFixture = {
      ...fixture,
      payload: {
        ...payload,
        quality: {
          ...quality,
          reasons: ["LOW_LIGHT"],
        },
      },
    };

    expect(() => visionEventSchema.parse(invalidFixture)).toThrow(
      /usable snapshots/,
    );
  });
});
