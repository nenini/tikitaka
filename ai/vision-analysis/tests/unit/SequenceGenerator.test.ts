import { describe, expect, it } from "vitest";

import { createClientInstanceId } from "../../src/common/ClientInstanceId.js";
import { MonotonicSequenceGenerator } from "../../src/common/SequenceGenerator.js";

describe("MonotonicSequenceGenerator", () => {
  it("starts at one, increases monotonically, and resets explicitly", () => {
    const sequence = new MonotonicSequenceGenerator();

    expect(sequence.current()).toBe(0);
    expect(sequence.next()).toBe(1);
    expect(sequence.next()).toBe(2);
    sequence.reset();
    expect(sequence.current()).toBe(0);
    expect(sequence.next()).toBe(1);
  });
});

describe("createClientInstanceId", () => {
  it("uses an injectable UUID factory", () => {
    expect(createClientInstanceId(() => "instance-1")).toBe("instance-1");
  });

  it("rejects an empty identifier", () => {
    expect(() => createClientInstanceId(() => "")).toThrow(/empty/);
  });
});

