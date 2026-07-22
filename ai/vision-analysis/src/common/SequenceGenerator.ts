export interface SequenceGenerator {
  next(): number;
  current(): number;
  reset(): void;
}

export class MonotonicSequenceGenerator implements SequenceGenerator {
  private value = 0;

  next(): number {
    if (this.value >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("sequence exhausted Number.MAX_SAFE_INTEGER");
    }

    this.value += 1;
    return this.value;
  }

  current(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}

