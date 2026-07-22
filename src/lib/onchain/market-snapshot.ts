import "server-only";

import { createPublicClient, formatUnits, http, parseAbiItem, type Address, type Hash } from "viem";
import { arcTestnet } from "@/lib/chains";
import { getVerifiedFactoryLaunch } from "@/lib/onchain/holder-snapshot";
import type { ChartPoint, Trade } from "@/lib/types";

const tokenBoughtEvent = parseAbiItem("event TokenBought(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 fee)");
const tokenSoldEvent = parseAbiItem("event TokenSold(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee)");
const tradeEvents = [tokenBoughtEvent, tokenSoldEvent] as const;
const tokenConfigAbi = [{ type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;
const curveAbi = [
  { type: "function", name: "initialTokenReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "virtualUsdcReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduationThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "usdcReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isGraduated", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;
const LOG_BLOCK_RANGE = 9_999n;
const CHART_TRADE_LIMIT = 240;
const CACHE_TTL_MS = 30_000;
const MIN_REFRESH_INTERVAL_MS = 10_000;
const MAX_TOKEN_CACHES = 50;
const MAX_BLOCK_TIMESTAMPS = 1_000;

export type MarketSnapshot = {
  price: number;
  priceChange: number;
  marketCap: number;
  volume: number;
  buyers: number;
  sellers: number;
  raisedUsdc: number;
  targetUsdc: number;
  progress: number;
  graduated: boolean;
  tokensSold: number;
  tokenReserve: number;
  chart: ChartPoint[];
  trades: Trade[];
  indexedBlock: string;
  generatedAt: string;
};

type MarketCacheEntry = {
  snapshot: MarketSnapshot | null;
  cachedAt: number;
  lastAttemptAt: number;
  pending: Promise<MarketSnapshot> | null;
};

type IndexedTrade = {
  blockNumber: bigint;
  logIndex: number;
  hash: Hash;
  wallet: Address;
  type: "Buy" | "Sell";
  usdc: number;
  notional: number;
  tokens: number;
};

type MarketState = {
  tokenCaches: Map<string, MarketCacheEntry>;
  blockTimestamps: Map<string, number>;
};

const rpcUrl = process.env.ARC_TESTNET_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl, { retryCount: 0, timeout: 15_000 }),
});

declare global {
  var __arcOriginMarketState: MarketState | undefined;
}

const state = globalThis.__arcOriginMarketState ?? { tokenCaches: new Map(), blockTimestamps: new Map() };
globalThis.__arcOriginMarketState = state;

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

function roundUsdc(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function loadBlockTimestamps(blockNumbers: bigint[]) {
  const timestamps = new Map<string, number>();
  const uniqueBlocks = [...new Set(blockNumbers.map((blockNumber) => blockNumber.toString()))];
  for (const blockKey of uniqueBlocks) {
    const cached = state.blockTimestamps.get(blockKey);
    if (cached !== undefined) {
      timestamps.set(blockKey, cached);
      continue;
    }
    const block = await withRpcRetry(() => publicClient.getBlock({ blockNumber: BigInt(blockKey) }));
    const timestamp = Number(block.timestamp);
    state.blockTimestamps.set(blockKey, timestamp);
    timestamps.set(blockKey, timestamp);
    if (state.blockTimestamps.size > MAX_BLOCK_TIMESTAMPS) {
      const oldestKey = state.blockTimestamps.keys().next().value as string | undefined;
      if (oldestKey) state.blockTimestamps.delete(oldestKey);
    }
    await wait(80);
  }
  return timestamps;
}

async function loadMarketSnapshot(tokenAddress: Address): Promise<MarketSnapshot> {
  const { launch, indexedBlock } = await getVerifiedFactoryLaunch(tokenAddress);
  const readAtBlock = <T>(operation: () => Promise<T>) => withRpcRetry(operation);
  const totalSupplyRaw = await readAtBlock(() => publicClient.readContract({ address: launch.token, abi: tokenConfigAbi, functionName: "totalSupply", blockNumber: indexedBlock }));
  const initialReserveRaw = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "initialTokenReserve", blockNumber: indexedBlock }));
  const virtualUsdcRaw = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "virtualUsdcReserve", blockNumber: indexedBlock }));
  const graduationRaw = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "graduationThreshold", blockNumber: indexedBlock }));
  const tokenReserveRaw = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "tokenReserve", blockNumber: indexedBlock }));
  const usdcReserveRaw = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "usdcReserve", blockNumber: indexedBlock }));
  const graduated = await readAtBlock(() => publicClient.readContract({ address: launch.curve, abi: curveAbi, functionName: "isGraduated", blockNumber: indexedBlock }));
  if (tokenReserveRaw <= 0n || initialReserveRaw <= 0n || totalSupplyRaw <= 0n) throw new Error("Curve reserves are invalid at the indexed block.");

  const events: IndexedTrade[] = [];
  for (let fromBlock = launch.launchBlock; fromBlock <= indexedBlock; fromBlock += LOG_BLOCK_RANGE + 1n) {
    const toBlock = fromBlock + LOG_BLOCK_RANGE < indexedBlock ? fromBlock + LOG_BLOCK_RANGE : indexedBlock;
    const logs = await withRpcRetry(() => publicClient.getLogs({
      address: launch.curve,
      events: tradeEvents,
      fromBlock,
      toBlock,
    }));
    for (const log of logs) {
      events.push(log.eventName === "TokenBought" ? {
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
        hash: log.transactionHash as Hash,
        wallet: log.args.buyer as Address,
        type: "Buy",
        usdc: Number(formatUnits(log.args.usdcIn ?? 0n, 6)),
        notional: Number(formatUnits(log.args.usdcIn ?? 0n, 6)),
        tokens: Number(formatUnits(log.args.tokensOut ?? 0n, 18)),
      } : {
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
        hash: log.transactionHash as Hash,
        wallet: log.args.seller as Address,
        type: "Sell",
        usdc: Number(formatUnits(log.args.usdcOut ?? 0n, 6)),
        notional: Number(formatUnits((log.args.usdcOut ?? 0n) + (log.args.fee ?? 0n), 6)),
        tokens: Number(formatUnits(log.args.tokensIn ?? 0n, 18)),
      });
    }
  }

  const totalSupply = Number(formatUnits(totalSupplyRaw, 18));
  const initialReserve = Number(formatUnits(initialReserveRaw, 18));
  const virtualUsdc = Number(formatUnits(virtualUsdcRaw, 6));
  const targetUsdc = Number(formatUnits(graduationRaw, 6));
  const tokenReserve = Number(formatUnits(tokenReserveRaw, 18));
  const raisedUsdc = Number(formatUnits(usdcReserveRaw, 6));
  const price = (virtualUsdc + raisedUsdc) / tokenReserve;
  const launchPrice = virtualUsdc / initialReserve;

  const validEvents = events.filter((event) => event.tokens > 0).sort((left, right) => left.blockNumber === right.blockNumber
    ? left.logIndex - right.logIndex
    : left.blockNumber < right.blockNumber ? -1 : 1);

  const chartEvents = validEvents.slice(-CHART_TRADE_LIMIT);
  const blockTimestamps = await loadBlockTimestamps([launch.launchBlock, ...chartEvents.map((event) => event.blockNumber), indexedBlock]);
  const trades: Trade[] = validEvents.slice().reverse().map((event) => ({
    time: `Block ${event.blockNumber.toString()}`,
    timestamp: blockTimestamps.get(event.blockNumber.toString()),
    type: event.type,
    wallet: event.wallet,
    usdc: event.usdc,
    tokens: event.tokens,
    price: event.notional / event.tokens,
    txHash: event.hash,
  }));
  const chart: ChartPoint[] = [
    { time: "Launch", timestamp: blockTimestamps.get(launch.launchBlock.toString()), price: launchPrice, volume: 0 },
    ...chartEvents.map((event) => ({
      time: `#${(event.blockNumber % 100_000n).toString()}`,
      timestamp: blockTimestamps.get(event.blockNumber.toString()),
      price: event.notional / event.tokens,
      volume: event.notional,
    })),
    { time: "Now", timestamp: blockTimestamps.get(indexedBlock.toString()), price, volume: 0 },
  ];

  return {
    price,
    priceChange: (price / launchPrice - 1) * 100,
    marketCap: price * totalSupply,
    volume: validEvents.reduce((sum, event) => roundUsdc(sum + event.notional), 0),
    buyers: validEvents.filter((event) => event.type === "Buy").length,
    sellers: validEvents.filter((event) => event.type === "Sell").length,
    raisedUsdc,
    targetUsdc,
    progress: targetUsdc > 0 ? raisedUsdc / targetUsdc * 100 : 0,
    graduated,
    tokensSold: initialReserve - tokenReserve,
    tokenReserve,
    chart,
    trades,
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
  const entry: MarketCacheEntry = { snapshot: null, cachedAt: 0, lastAttemptAt: 0, pending: null };
  state.tokenCaches.set(key, entry);
  return entry;
}

export async function getMarketSnapshot(tokenAddress: Address, forceRefresh = false) {
  const cache = getTokenCache(tokenAddress);
  const now = Date.now();
  const isFresh = cache.snapshot && now - cache.cachedAt < CACHE_TTL_MS;
  const refreshThrottled = cache.snapshot && now - cache.lastAttemptAt < MIN_REFRESH_INTERVAL_MS;
  if (isFresh && !forceRefresh) return { snapshot: cache.snapshot, stale: false };
  if (refreshThrottled) return { snapshot: cache.snapshot, stale: now - cache.cachedAt >= CACHE_TTL_MS };
  if (!cache.snapshot && !cache.pending && cache.lastAttemptAt > 0 && now - cache.lastAttemptAt < MIN_REFRESH_INTERVAL_MS) {
    throw new Error("Arc RPC rate limit cooldown is active.");
  }

  if (!cache.pending) {
    cache.lastAttemptAt = now;
    cache.pending = loadMarketSnapshot(tokenAddress)
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

export function isMarketRpcError(error: unknown) {
  return isRetryableRpcError(error);
}
