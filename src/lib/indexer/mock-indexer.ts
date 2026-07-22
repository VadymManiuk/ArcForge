import { mockTokens } from "../mock-data";

// Explicit demo-only boundary. Factory launches use the live viem event index instead.
export async function listIndexedTokens() { return mockTokens; }
export async function findIndexedToken(address: string) { return mockTokens.find((token) => token.address.toLowerCase() === address.toLowerCase()); }
