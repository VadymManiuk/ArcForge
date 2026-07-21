import { mockTokens } from "../mock-data";

// Mirrors the query boundary a real viem log indexer will implement after deployment.
export async function listIndexedTokens() { return mockTokens; }
export async function findIndexedToken(address: string) { return mockTokens.find((token) => token.address.toLowerCase() === address.toLowerCase()); }
