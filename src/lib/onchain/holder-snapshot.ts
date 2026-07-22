import "server-only";

import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { ARC_TESTNET_CONTRACTS, ARC_TESTNET_FIRST_LAUNCH_BLOCK, arcTestnet } from "@/lib/chains";

const tokenLaunchedEvent = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed creator, string name, string symbol)");
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LOG_BLOCK_RANGE = 9_999n;
const FACTORY_CACHE_TTL_MS = 60_000;
const HOLDER_CACHE_TTL_MS = 45_000;
const MIN_REFRESH_INTERVAL_MS = 10_000;
const MAX_TOKEN_CACHES = 50;

type FactoryLaunch = {
  token: Address;
  curve: Address;
  creator: Address;
  launchBlock: bigint;
};

export type HolderSnapshot = {
  holders: number;
  creatorPercent: number;
  curvePercent: number;
  topTenExcludingCurvePercent: number;
  indexedBlock: string;
  generatedAt: string;
};

type HolderCacheEntry = {
  snapshot: HolderSnapshot | null;
  cachedAt: number;
  lastAttemptAt: number;
  pending: Promise<HolderSnapshot> | null;
};

type HolderState = {
  factoryLaunches: Map<string, FactoryLaunch>;
  factoryCachedAt: number;
  factoryPending: Promise<Map<string, FactoryLaunch>> | null;
  tokenCaches: Map<string, HolderCacheEntry>;
};

const rpcUrl = process.env.ARC_TESTNET_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl, { retryCount: 0, timeout: 15_000 }),
});

declare global {
  var __arcOriginHolderState: HolderState | undefined;
}

const state = globalThis.__arcOriginHolderState ?? {
  factoryLaunches: new Map(),
  factoryCachedAt: 0,
  factoryPending: null,
  tokenCaches: new Map(),
};
globalThis.__arcOriginHolderState = state;

export class FactoryTokenNotFoundError extends Error {}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableRpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|rate limit|request limit|\b429\b|timed? ?out|socket/i.test(message);
}

async function withRpcRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableRpcError(error) || attempt === attempts) throw error;
      await wait(attempt * 750);
    }
  }
  throw new Error("Arc RPC request failed after retries.");
}

async function loadFactoryLaunches(indexedBlock: bigint) {
  const launches = new Map<string, FactoryLaunch>();
  for (let fromBlock = ARC_TESTNET_FIRST_LAUNCH_BLOCK; fromBlock <= indexedBlock; fromBlock += LOG_BLOCK_RANGE + 1n) {
    const toBlock = fromBlock + LOG_BLOCK_RANGE < indexedBlock ? fromBlock + LOG_BLOCK_RANGE : indexedBlock;
    const logs = await withRpcRetry(() => publicClient.getLogs({
      address: ARC_TESTNET_CONTRACTS.factory,
      event: tokenLaunchedEvent,
      fromBlock,
      toBlock,
    }));
    for (const log of logs) {
      const token = log.args.token as Address;
      launches.set(token.toLowerCase(), {
        token,
        curve: log.args.curve as Address,
        creator: log.args.creator as Address,
        launchBlock: log.blockNumber ?? 0n,
      });
    }
  }
  return launches;
}

async function getFactoryLaunches(indexedBlock: bigint, forceRefresh: boolean) {
  if (!forceRefresh && state.factoryLaunches.size > 0 && Date.now() - state.factoryCachedAt < FACTORY_CACHE_TTL_MS) {
    return state.factoryLaunches;
  }
  if (!state.factoryPending) {
    state.factoryPending = loadFactoryLaunches(indexedBlock)
      .then((launches) => {
        state.factoryLaunches = launches;
        state.factoryCachedAt = Date.now();
        return launches;
      })
      .finally(() => {
        state.factoryPending = null;
      });
  }
  return state.factoryPending;
}

function percentOf(part: bigint, total: bigint) {
  if (total === 0n) return 0;
  return Number(part * 1_000_000n / total) / 10_000;
}

async function loadHolderSnapshot(tokenAddress: Address, forceFactoryRefresh: boolean): Promise<HolderSnapshot> {
  const indexedBlock = await withRpcRetry(() => publicClient.getBlockNumber());
  let launches = await getFactoryLaunches(indexedBlock, forceFactoryRefresh);
  let launch = launches.get(tokenAddress.toLowerCase());
  if (!launch && !forceFactoryRefresh) {
    launches = await getFactoryLaunches(indexedBlock, true);
    launch = launches.get(tokenAddress.toLowerCase());
  }
  if (!launch) throw new FactoryTokenNotFoundError("Token was not launched by the configured ArcOrigin factory.");

  const balances = new Map<string, bigint>();
  for (let fromBlock = launch.launchBlock; fromBlock <= indexedBlock; fromBlock += LOG_BLOCK_RANGE + 1n) {
    const toBlock = fromBlock + LOG_BLOCK_RANGE < indexedBlock ? fromBlock + LOG_BLOCK_RANGE : indexedBlock;
    const logs = await withRpcRetry(() => publicClient.getLogs({
      address: launch.token,
      event: transferEvent,
      fromBlock,
      toBlock,
    }));
    for (const log of logs) {
      const from = (log.args.from ?? ZERO_ADDRESS).toLowerCase();
      const to = (log.args.to ?? ZERO_ADDRESS).toLowerCase();
      const value = log.args.value ?? 0n;
      if (from !== ZERO_ADDRESS) balances.set(from, (balances.get(from) ?? 0n) - value);
      if (to !== ZERO_ADDRESS) balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  const positiveBalances = [...balances.entries()].filter(([, balance]) => balance > 0n);
  const totalSupply = positiveBalances.reduce((sum, [, balance]) => sum + balance, 0n);
  const curveAddress = launch.curve.toLowerCase();
  const creatorBalance = balances.get(launch.creator.toLowerCase()) ?? 0n;
  const curveBalance = balances.get(curveAddress) ?? 0n;
  const topTenExcludingCurve = positiveBalances
    .filter(([address]) => address !== curveAddress)
    .map(([, balance]) => balance)
    .sort((left, right) => left === right ? 0 : left > right ? -1 : 1)
    .slice(0, 10)
    .reduce((sum, balance) => sum + balance, 0n);

  return {
    holders: positiveBalances.length,
    creatorPercent: percentOf(creatorBalance, totalSupply),
    curvePercent: percentOf(curveBalance, totalSupply),
    topTenExcludingCurvePercent: percentOf(topTenExcludingCurve, totalSupply),
    indexedBlock: indexedBlock.toString(),
    generatedAt: new Date().toISOString(),
  };
}

function getTokenCache(tokenAddress: Address) {
  const key = tokenAddress.toLowerCase();
  const existing = state.tokenCaches.get(key);
  if (existing) return existing;
  if (state.tokenCaches.size >= MAX_TOKEN_CACHES) {
    const oldestKey = state.tokenCaches.keys().next().value as string | undefined;
    if (oldestKey) state.tokenCaches.delete(oldestKey);
  }
  const entry: HolderCacheEntry = { snapshot: null, cachedAt: 0, lastAttemptAt: 0, pending: null };
  state.tokenCaches.set(key, entry);
  return entry;
}

export async function getHolderSnapshot(tokenAddress: Address, forceRefresh = false) {
  const cache = getTokenCache(tokenAddress);
  const now = Date.now();
  const isFresh = cache.snapshot && now - cache.cachedAt < HOLDER_CACHE_TTL_MS;
  const refreshThrottled = cache.snapshot && now - cache.lastAttemptAt < MIN_REFRESH_INTERVAL_MS;
  if (isFresh && !forceRefresh) return { snapshot: cache.snapshot, stale: false };
  if (refreshThrottled) return { snapshot: cache.snapshot, stale: now - cache.cachedAt >= HOLDER_CACHE_TTL_MS };
  if (!cache.snapshot && !cache.pending && cache.lastAttemptAt > 0 && now - cache.lastAttemptAt < MIN_REFRESH_INTERVAL_MS) {
    throw new Error("Arc RPC rate limit cooldown is active.");
  }

  if (!cache.pending) {
    cache.lastAttemptAt = now;
    cache.pending = loadHolderSnapshot(tokenAddress, forceRefresh)
      .then((snapshot) => {
        cache.snapshot = snapshot;
        cache.cachedAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        cache.pending = null;
      });
  }

  try {
    const snapshot = await cache.pending;
    return { snapshot, stale: false };
  } catch (error) {
    if (cache.snapshot) return { snapshot: cache.snapshot, stale: true };
    throw error;
  }
}

export function isHolderRpcError(error: unknown) {
  return isRetryableRpcError(error);
}
