export type UuidFactory = () => string;

function browserUuidFactory(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("crypto.randomUUID is unavailable in this browser");
  }

  return globalThis.crypto.randomUUID();
}

export function createClientInstanceId(
  uuidFactory: UuidFactory = browserUuidFactory,
): string {
  const clientInstanceId = uuidFactory();

  if (clientInstanceId.length === 0) {
    throw new Error("uuidFactory returned an empty client instance id");
  }

  return clientInstanceId;
}

