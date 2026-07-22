export const indexedEventNames = ["TokenLaunched", "TokenBought", "TokenSold", "FeeReceived", "FeeWithdrawn", "CurveGraduated", "CreatorRegistered", "Transfer"] as const;
export type IndexedEventName = (typeof indexedEventNames)[number];
export type IndexedEvent = { name: IndexedEventName; blockNumber: bigint; transactionHash: `0x${string}`; args: Record<string, unknown> };
