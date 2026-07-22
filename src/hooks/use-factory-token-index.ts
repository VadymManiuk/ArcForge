"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { loadOnchainTokenSnapshot, type OnchainTokenSnapshot } from "@/components/onchain-token-dashboard";
import { ARC_TESTNET_CONTRACTS, ARC_TESTNET_FIRST_LAUNCH_BLOCK, arcTestnet } from "@/lib/chains";
import { genesisToken } from "@/lib/mock-data";
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

function applySnapshot(token: TokenData, snapshot: OnchainTokenSnapshot): TokenData {
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
    holders: 2,
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
  includeMarketData: boolean,
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
      creatorProfile: { ...genesisToken.creatorProfile, launches: creatorLaunches },
    };
    return includeMarketData ? applySnapshot(base, await loadOnchainTokenSnapshot(client, base)) : base;
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
    description: "ArcForge Factory launch indexed from Arc Testnet events.",
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
    holders: 2,
    curveProgress: 0,
    riskScore: risk.score,
    status: "Live on curve",
    chartData: [{ time: "Launch", price: virtualUsdcReserve / initialReserve, volume: 0 }],
    recentTrades: [],
    riskLabels: risk.labels,
    creatorProfile,
    socials: {},
  };
  return includeMarketData ? applySnapshot(base, await loadOnchainTokenSnapshot(client, base)) : base;
}

async function loadFactoryTokens(client: PublicClient, includeMarketData: boolean) {
  const logs = await withRpcRetry(() => client.getLogs({
    address: ARC_TESTNET_CONTRACTS.factory,
    event: tokenLaunchedEvent,
    fromBlock: ARC_TESTNET_FIRST_LAUNCH_BLOCK,
    toBlock: "latest",
  }));
  const counts = new Map<string, number>();
  for (const log of logs) {
    const creator = String(log.args.creator).toLowerCase();
    counts.set(creator, (counts.get(creator) ?? 0) + 1);
  }
  const tokens: TokenData[] = [];
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
    tokens.push(await hydrateLaunch(client, launch, counts.get(launch.creator.toLowerCase()) ?? 1, includeMarketData));
    await wait(500);
  }
  return tokens;
}

export function useFactoryTokenIndex({ includeMarketData = true }: { includeMarketData?: boolean } = {}) {
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      setTokens(await loadFactoryTokens(client, includeMarketData));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(/rate limit|request limit|Too Many Requests|\b429\b|RPC Request failed|HTTP request failed/i.test(message)
        ? "Arc Testnet RPC is rate-limited. Factory launches were not replaced with simulated data; retry in a moment."
        : "Factory launch events could not be indexed from Arc Testnet.");
    } finally {
      setLoading(false);
    }
  }, [client, includeMarketData]);

  useEffect(() => {
    void refresh();
    const handleRefresh = () => void refresh();
    window.addEventListener("arcforge:launch-confirmed", handleRefresh);
    window.addEventListener("arcforge:trade-confirmed", handleRefresh);
    return () => {
      window.removeEventListener("arcforge:launch-confirmed", handleRefresh);
      window.removeEventListener("arcforge:trade-confirmed", handleRefresh);
    };
  }, [refresh]);

  return { tokens, loading, error, refresh };
}
