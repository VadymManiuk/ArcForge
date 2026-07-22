"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, isAddress, parseAbiItem, publicActions, type Address, type GetLogsReturnType, type Hash, type PublicClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { ARC_TESTNET_CONTRACTS, ARC_TESTNET_FIRST_LAUNCH_BLOCK, arcTestnet } from "@/lib/chains";
import { genesisToken } from "@/lib/mock-data";
import type { HolderSnapshot } from "@/lib/onchain/holder-snapshot";
import type { MarketSnapshot } from "@/lib/onchain/market-snapshot";
import { calculateRiskScore } from "@/lib/scoring";
import type { CreatorProfile, TokenData } from "@/lib/types";

const tokenLaunchedEvent = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed creator, string name, string symbol)");
const tokenConfigAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const curveConfigAbi = [
  { type: "function", name: "initialTokenReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "virtualUsdcReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduationThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const TOKEN_INDEX_CACHE_KEY = `arcforge:${arcTestnet.id}:${ARC_TESTNET_CONTRACTS.factory.toLowerCase()}:factory-index-v2`;
const TOKEN_INDEX_CACHE_TTL = 6 * 60 * 60 * 1_000;
const TOKEN_INDEX_BLOCK_CHUNK = 10_000n;

type CachedIndex = { savedAt: number; tokens: TokenData[] };

function isCachedToken(value: unknown): value is TokenData {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<TokenData>;
  return token.source === "onchain"
    && typeof token.name === "string"
    && typeof token.ticker === "string"
    && typeof token.address === "string"
    && isAddress(token.address)
    && typeof token.curveAddress === "string"
    && isAddress(token.curveAddress)
    && typeof token.creator === "string"
    && isAddress(token.creator)
    && typeof token.launchBlock === "number"
    && token.launchBlock >= Number(ARC_TESTNET_FIRST_LAUNCH_BLOCK)
    && typeof token.launchTxHash === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(token.launchTxHash)
    && typeof token.price === "number"
    && Number.isFinite(token.price)
    && typeof token.marketCap === "number"
    && Number.isFinite(token.marketCap)
    && Array.isArray(token.chartData)
    && Array.isArray(token.recentTrades)
    && Array.isArray(token.riskLabels)
    && Boolean(token.creatorProfile);
}

function readCachedIndex(): CachedIndex | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_INDEX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedIndex>;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TOKEN_INDEX_CACHE_TTL) return null;
    if (!Array.isArray(parsed.tokens) || parsed.tokens.length === 0 || parsed.tokens.length > 100 || !parsed.tokens.every(isCachedToken)) return null;
    return { savedAt: parsed.savedAt, tokens: parsed.tokens };
  } catch {
    return null;
  }
}

function writeCachedIndex(tokens: TokenData[]) {
  try {
    const snapshot: CachedIndex = { savedAt: Date.now(), tokens };
    window.localStorage.setItem(TOKEN_INDEX_CACHE_KEY, JSON.stringify(snapshot));
    return snapshot.savedAt;
  } catch {
    return null;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRpcRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|rate limit|request limit|\b429\b/i.test(message);
      if (!retryable || attempt === attempts) throw error;
      await wait(attempt * 700);
    }
  }
  throw new Error("Arc RPC request failed after retries.");
}

function applySnapshot(token: TokenData, snapshot: MarketSnapshot, holderSnapshot: HolderSnapshot | null): TokenData {
  return {
    ...token,
    price: snapshot.price,
    priceChange24h: snapshot.priceChange,
    marketCap: snapshot.marketCap,
    raisedUSDC: snapshot.raisedUsdc,
    volume5m: 0,
    volume1h: 0,
    volume24h: snapshot.volume,
    buyers: snapshot.buyers,
    sellers: snapshot.sellers,
    trades: snapshot.trades.length,
    holders: holderSnapshot?.holders ?? 0,
    curveProgress: snapshot.progress,
    status: snapshot.progress >= 100 ? "Graduated" : snapshot.progress >= 75 ? "Graduating soon" : "Live on curve",
    chartData: snapshot.chart,
    recentTrades: snapshot.trades,
    creatorProfile: {
      ...token.creatorProfile,
      totalVolume: snapshot.volume,
    },
  };
}

function iconFor(name: string, symbol: string) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("");
  return (initials || symbol.slice(0, 2) || "T").toUpperCase();
}

async function hydrateLaunch(
  client: PublicClient,
  launch: {
    token: Address;
    curve: Address;
    creator: Address;
    name: string;
    symbol: string;
    blockNumber: bigint;
    transactionHash: Hash;
  },
  creatorLaunches: number,
) {
  if (launch.token.toLowerCase() === genesisToken.address.toLowerCase()) {
    const base = {
      ...genesisToken,
      name: launch.name,
      ticker: launch.symbol,
      address: launch.token,
      curveAddress: launch.curve,
      creator: launch.creator,
      launchBlock: Number(launch.blockNumber),
      launchTxHash: launch.transactionHash,
      holders: 0,
      creatorProfile: { ...genesisToken.creatorProfile, launches: creatorLaunches },
    };
    return base;
  }

  const totalSupplyRaw = await withRpcRetry(() => client.readContract({
    address: launch.token,
    abi: tokenConfigAbi,
    functionName: "totalSupply",
  }));
  await wait(350);
  const initialReserveRaw = await withRpcRetry(() => client.readContract({
    address: launch.curve,
    abi: curveConfigAbi,
    functionName: "initialTokenReserve",
  }));
  await wait(350);
  const virtualUsdcRaw = await withRpcRetry(() => client.readContract({
    address: launch.curve,
    abi: curveConfigAbi,
    functionName: "virtualUsdcReserve",
  }));
  await wait(350);
  const graduationRaw = await withRpcRetry(() => client.readContract({
    address: launch.curve,
    abi: curveConfigAbi,
    functionName: "graduationThreshold",
  }));
  const totalSupply = Number(formatUnits(totalSupplyRaw, 18));
  const initialReserve = Number(formatUnits(initialReserveRaw, 18));
  const creatorAllocationPercent = totalSupply > 0 ? (totalSupply - initialReserve) / totalSupply * 100 : 0;
  const virtualUsdcReserve = Number(formatUnits(virtualUsdcRaw, 6));
  const targetUSDC = Number(formatUnits(graduationRaw, 6));
  const risk = calculateRiskScore({
    fixedSupply: true,
    standardTemplate: true,
    noBlacklist: true,
    noHiddenMint: true,
    creatorAllocationPercent,
    socialsPresent: false,
    verifiedTemplate: true,
    holderConcentrationKnown: false,
    topTenHolderPercent: 100,
    previousCleanLaunches: 0,
  });
  const creatorProfile: CreatorProfile = {
    address: launch.creator,
    reputation: creatorLaunches > 1 ? 55 : 50,
    launches: creatorLaunches,
    graduated: 0,
    flagged: 0,
    totalVolume: 0,
    totalFees: 25,
    verified: false,
  };
  const base: TokenData = {
    name: launch.name,
    ticker: launch.symbol,
    icon: iconFor(launch.name, launch.symbol),
    address: launch.token,
    curveAddress: launch.curve,
    creator: launch.creator,
    source: "onchain",
    creatorAllocationPercent,
    launchTxHash: launch.transactionHash,
    launchBlock: Number(launch.blockNumber),
    totalSupply,
    virtualUsdcReserve,
    description: "ArcOrigin factory launch indexed from Arc Testnet events.",
    ageMinutes: 0,
    price: virtualUsdcReserve / initialReserve,
    priceChange24h: 0,
    marketCap: virtualUsdcReserve / initialReserve * totalSupply,
    raisedUSDC: 0,
    targetUSDC,
    volume5m: 0,
    volume1h: 0,
    volume24h: 0,
    buyers: 0,
    sellers: 0,
    trades: 0,
    holders: 0,
    curveProgress: 0,
    riskScore: risk.score,
    status: "Live on curve",
    chartData: [{ time: "Launch", price: virtualUsdcReserve / initialReserve, volume: 0 }],
    recentTrades: [],
    riskLabels: risk.labels,
    creatorProfile,
    socials: {},
  };
  return base;
}

async function loadServerSnapshot<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const payload = await response.json() as { snapshot?: T; error?: string };
  if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Onchain snapshot is unavailable.");
  return payload.snapshot;
}

async function loadFactoryTokens(client: PublicClient, includeMarketData: boolean) {
  const latestBlock = await withRpcRetry(() => client.getBlockNumber());
  if (latestBlock < ARC_TESTNET_FIRST_LAUNCH_BLOCK) {
    throw new Error("Arc RPC is behind the configured first Factory launch block.");
  }
  const logs: GetLogsReturnType<typeof tokenLaunchedEvent> = [];
  for (let fromBlock = ARC_TESTNET_FIRST_LAUNCH_BLOCK; fromBlock <= latestBlock; fromBlock += TOKEN_INDEX_BLOCK_CHUNK) {
    const chunkEnd = fromBlock + TOKEN_INDEX_BLOCK_CHUNK - 1n;
    const toBlock = chunkEnd < latestBlock ? chunkEnd : latestBlock;
    const chunk = await withRpcRetry(() => client.getLogs({
      address: ARC_TESTNET_CONTRACTS.factory,
      event: tokenLaunchedEvent,
      fromBlock,
      toBlock,
    }));
    logs.push(...chunk);
    if (toBlock < latestBlock) await wait(150);
  }
  if (logs.length === 0) {
    throw new Error("Arc RPC returned no Factory launches for the configured index range.");
  }
  const counts = new Map<string, number>();
  for (const log of logs) {
    const creator = String(log.args.creator).toLowerCase();
    counts.set(creator, (counts.get(creator) ?? 0) + 1);
  }
  const tokens: TokenData[] = [];
  let marketDataError: unknown;
  for (const log of logs.slice().reverse()) {
    const launch = {
      token: log.args.token as Address,
      curve: log.args.curve as Address,
      creator: log.args.creator as Address,
      name: log.args.name ?? "Indexed token",
      symbol: log.args.symbol ?? "TOKEN",
      blockNumber: log.blockNumber ?? 0n,
      transactionHash: log.transactionHash as Hash,
    };
    const base = await hydrateLaunch(client, launch, counts.get(launch.creator.toLowerCase()) ?? 1);
    if (!includeMarketData) {
      tokens.push(base);
    } else {
      try {
        const marketSnapshot = await loadServerSnapshot<MarketSnapshot>(`/api/onchain/tokens/${base.address}/market`);
        let holderSnapshot: HolderSnapshot | null = null;
        try {
          holderSnapshot = await loadServerSnapshot<HolderSnapshot>(`/api/onchain/tokens/${base.address}/holders`);
        } catch {
          holderSnapshot = null;
        }
        tokens.push(applySnapshot(base, marketSnapshot, holderSnapshot));
      } catch (loadError) {
        marketDataError ??= loadError;
        tokens.push(base);
      }
    }
    await wait(500);
  }
  return { tokens, marketDataError };
}

export function useFactoryTokenIndex({ includeMarketData = true, allowCache = true }: { includeMarketData?: boolean; allowCache?: boolean } = {}) {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: walletClient } = useWalletClient();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCached, setIsCached] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    const walletReadClient = walletClient?.chain.id === arcTestnet.id
      ? walletClient.extend(publicActions) as unknown as PublicClient
      : null;
    const clients = [walletReadClient, publicClient].filter((client): client is PublicClient => Boolean(client));
    if (clients.length === 0) return;
    setLoading(true);
    setError("");
    let lastError: unknown;
    let partialResult: Awaited<ReturnType<typeof loadFactoryTokens>> | null = null;
    for (const client of clients) {
      try {
        const result = await loadFactoryTokens(client, includeMarketData);
        if (result.marketDataError) {
          partialResult ??= result;
          lastError = result.marketDataError;
          continue;
        }
        setTokens(result.tokens);
        setIsCached(false);
        setIsPartial(false);
        setCachedAt(allowCache && includeMarketData ? writeCachedIndex(result.tokens) : null);
        setLoading(false);
        return;
      } catch (loadError) {
        lastError = loadError;
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    if (partialResult) {
      setTokens(partialResult.tokens);
      setIsCached(false);
      setIsPartial(true);
      setCachedAt(null);
      setError(/rate limit|request limit|Too Many Requests|\b429\b|RPC Request failed|HTTP request failed/i.test(message)
        ? "Factory launches are confirmed, but Arc Testnet RPC rate-limited live market values. Retry will use Rabby first."
        : "Factory launches are confirmed, but live market values could not be loaded.");
      setLoading(false);
      return;
    }
    setIsCached(true);
    setIsPartial(false);
    setError(/rate limit|request limit|Too Many Requests|\b429\b|RPC Request failed|HTTP request failed/i.test(message)
      ? "Arc Testnet RPC is rate-limited. Retry will use Rabby first, then the public RPC."
      : "Factory launch events could not be indexed from Arc Testnet.");
    setLoading(false);
  }, [allowCache, includeMarketData, publicClient, walletClient]);

  useEffect(() => {
    if (allowCache && includeMarketData) {
      const cached = readCachedIndex();
      if (cached) {
        setTokens(cached.tokens);
        setIsCached(true);
        setIsPartial(false);
        setCachedAt(cached.savedAt);
      }
    }
    void refresh();
    const handleRefresh = () => void refresh();
    window.addEventListener("arcforge:launch-confirmed", handleRefresh);
    window.addEventListener("arcforge:trade-confirmed", handleRefresh);
    return () => {
      window.removeEventListener("arcforge:launch-confirmed", handleRefresh);
      window.removeEventListener("arcforge:trade-confirmed", handleRefresh);
    };
  }, [allowCache, includeMarketData, refresh]);

  return { tokens, loading, error, refresh, isCached, isPartial, cachedAt };
}
