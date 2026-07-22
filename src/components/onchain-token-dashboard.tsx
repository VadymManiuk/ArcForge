"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { TokenChart } from "@/components/token-chart";
import { AddressPill, ArcscanLink, Badge, Button, Panel, Progress, StatCard, WarningBox } from "@/components/ui";
import { arcTestnet } from "@/lib/chains";
import type { ChartPoint, TokenData, Trade } from "@/lib/types";
import { money, number } from "@/lib/utils";

const tokenBoughtEvent = parseAbiItem("event TokenBought(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 fee)");
const tokenSoldEvent = parseAbiItem("event TokenSold(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee)");
const reserveAbi = [
  { type: "function", name: "tokenReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "usdcReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type OnchainTokenSnapshot = {
  price: number;
  priceChange: number;
  marketCap: number;
  volume: number;
  buyers: number;
  sellers: number;
  raisedUsdc: number;
  progress: number;
  tokensSold: number;
  tokenReserve: number;
  chart: ChartPoint[];
  trades: Trade[];
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readWithRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
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

function rpcMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|request limit|Too Many Requests|\b429\b|RPC Request failed|HTTP request failed/i.test(message)
    ? "Arc Testnet RPC is rate-limited. Live values were not replaced with simulated data; retry in a moment."
    : "Live Arc Testnet data could not be loaded. Retry to read the curve again."
}

export async function loadOnchainTokenSnapshot(client: PublicClient, token: TokenData): Promise<OnchainTokenSnapshot> {
  if (!token.curveAddress || token.launchBlock === undefined) throw new Error("Missing deployed curve metadata.");
  const curveAddress = token.curveAddress as Address;
  const fromBlock = BigInt(token.launchBlock);
  const creatorAllocation = token.creatorAllocationPercent ?? 0;
  const totalSupply = token.totalSupply ?? 1_000_000_000;
  const initialReserve = totalSupply * (100 - creatorAllocation) / 100;
  const virtualUsdc = token.virtualUsdcReserve ?? 10_000;

  const tokenReserveRaw = await readWithRetry(() => client.readContract({
    address: curveAddress,
    abi: reserveAbi,
    functionName: "tokenReserve",
  }));
  await wait(350);
  const usdcReserveRaw = await readWithRetry(() => client.readContract({
    address: curveAddress,
    abi: reserveAbi,
    functionName: "usdcReserve",
  }));
  await wait(350);
  const buyLogs = await readWithRetry(() => client.getLogs({
    address: curveAddress,
    event: tokenBoughtEvent,
    fromBlock,
    toBlock: "latest",
  }));
  await wait(350);
  const sellLogs = await readWithRetry(() => client.getLogs({
    address: curveAddress,
    event: tokenSoldEvent,
    fromBlock,
    toBlock: "latest",
  }));

  const tokenReserve = Number(formatUnits(tokenReserveRaw, 18));
  const raisedUsdc = Number(formatUnits(usdcReserveRaw, 6));
  const price = (virtualUsdc + raisedUsdc) / tokenReserve;
  const launchPrice = virtualUsdc / initialReserve;
  const progress = raisedUsdc / token.targetUSDC * 100;

  const events = [
    ...buyLogs.map((log) => ({
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      hash: log.transactionHash as Hash,
      wallet: log.args.buyer as Address,
      type: "Buy" as const,
      usdc: Number(formatUnits(log.args.usdcIn ?? 0n, 6)),
      notional: Number(formatUnits(log.args.usdcIn ?? 0n, 6)),
      tokens: Number(formatUnits(log.args.tokensOut ?? 0n, 18)),
    })),
    ...sellLogs.map((log) => ({
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      hash: log.transactionHash as Hash,
      wallet: log.args.seller as Address,
      type: "Sell" as const,
      usdc: Number(formatUnits(log.args.usdcOut ?? 0n, 6)),
      notional: Number(formatUnits((log.args.usdcOut ?? 0n) + (log.args.fee ?? 0n), 6)),
      tokens: Number(formatUnits(log.args.tokensIn ?? 0n, 18)),
    })),
  ].sort((left, right) => left.blockNumber === right.blockNumber
    ? left.logIndex - right.logIndex
    : left.blockNumber < right.blockNumber ? -1 : 1);

  const trades: Trade[] = events.slice().reverse().map((event) => ({
    time: `Block ${event.blockNumber.toString()}`,
    type: event.type,
    wallet: event.wallet,
    usdc: event.usdc,
    tokens: event.tokens,
    price: event.notional / event.tokens,
    txHash: event.hash,
  }));
  const chart: ChartPoint[] = [
    { time: "Launch", price: launchPrice, volume: 0 },
    ...events.map((event) => ({
      time: `#${(event.blockNumber % 100_000n).toString()}`,
      price: event.notional / event.tokens,
      volume: event.notional,
    })),
    { time: "Now", price, volume: 0 },
  ];

  return {
    price,
    priceChange: (price / launchPrice - 1) * 100,
    marketCap: price * totalSupply,
    volume: events.reduce((sum, event) => sum + event.notional, 0),
    buyers: buyLogs.length,
    sellers: sellLogs.length,
    raisedUsdc,
    progress,
    tokensSold: initialReserve - tokenReserve,
    tokenReserve,
    chart,
    trades,
  };
}

export function useOnchainTokenSnapshot(token: TokenData) {
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [snapshot, setSnapshot] = useState<OnchainTokenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadOnchainTokenSnapshot(client, token));
    } catch (loadError) {
      setError(rpcMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [client, token]);

  useEffect(() => {
    void refresh();
    const handleTrade = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      if (detail?.tokenAddress?.toLowerCase() === token.address.toLowerCase()) void refresh();
    };
    window.addEventListener("arcforge:trade-confirmed", handleTrade);
    return () => window.removeEventListener("arcforge:trade-confirmed", handleTrade);
  }, [refresh, token.address]);

  return { snapshot, loading, error, refresh };
}

export function OnchainTokenDashboard({ token }: { token: TokenData }) {
  const { snapshot, loading, error, refresh } = useOnchainTokenSnapshot(token);

  if (!snapshot) {
    return <Panel className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div><p className="eyebrow">Onchain market data</p><p className="mt-2 text-sm text-slate-400">{loading ? "Reading Arc Testnet reserves and events…" : "Live data unavailable"}</p></div>
        {!loading && <Button variant="ghost" onClick={() => void refresh()}>Retry</Button>}
      </div>
      {error && <WarningBox>{error}</WarningBox>}
    </Panel>;
  }

  const progressLabel = snapshot.progress > 0 && snapshot.progress < 0.01 ? "<0.01%" : `${snapshot.progress.toFixed(2)}%`;
  return <>
    <Panel className="p-5">
      <div className="mb-3 flex justify-end"><Badge tone={loading ? "neutral" : "good"}>{loading ? "Updating…" : "Live Arc RPC"}</Badge></div>
      <TokenChart data={snapshot.chart}/>
      {error && <WarningBox>{error}</WarningBox>}
    </Panel>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Market cap" value={money(snapshot.marketCap, true)} detail="Current curve price × supply"/>
      <StatCard label="Onchain volume" value={money(snapshot.volume)} detail={`${snapshot.trades.length} confirmed trades`}/>
      <StatCard label="Known holders" value="2+" detail="Transfer indexing pending"/>
      <StatCard label="Since launch" value={`${snapshot.priceChange >= 0 ? "+" : ""}${snapshot.priceChange.toFixed(2)}%`} className={snapshot.priceChange >= 0 ? "text-emerald-300" : "text-rose-300"}/>
    </div>
    <Panel className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Bonding curve</p><h2 className="mt-2 text-xl font-semibold text-white">{progressLabel} toward graduation</h2></div><div className="text-right"><p className="text-sm text-white">{money(snapshot.raisedUsdc)} / {money(token.targetUSDC)}</p><p className="mt-1 text-xs text-slate-500">USDC raised</p></div></div>
      <div className="my-5"><Progress value={snapshot.progress}/></div>
      <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-4"><Metric label="Tokens sold" value={number(snapshot.tokensSold)}/><Metric label="Curve inventory" value={number(snapshot.tokenReserve)}/><Metric label="Buys / sells" value={`${snapshot.buyers} / ${snapshot.sellers}`}/><Metric label="Migration" value="Not enabled"/></div>
    </Panel>
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5"><div><p className="eyebrow">Event activity</p><h2 className="mt-2 text-lg font-semibold">Recent onchain trades</h2></div><Button variant="ghost" disabled={loading} onClick={() => void refresh()}>Refresh</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-line font-mono text-[9px] uppercase tracking-wider text-slate-600"><th className="px-5 py-3">Block</th><th>Type</th><th>Wallet</th><th>USDC</th><th>Tokens</th><th>Price</th><th>Transaction</th></tr></thead><tbody>{snapshot.trades.map((trade) => <tr key={trade.txHash} className="border-b border-line/60 last:border-0"><td className="px-5 py-3 text-slate-500">{trade.time}</td><td><Badge tone={trade.type === "Buy" ? "good" : "bad"}>{trade.type}</Badge></td><td><AddressPill address={trade.wallet}/></td><td className="text-slate-300">{money(trade.usdc)}</td><td className="text-slate-300">{number(trade.tokens)}</td><td className="text-slate-400">{money(trade.price)}</td><td><ArcscanLink hash={trade.txHash}/></td></tr>)}{snapshot.trades.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No TokenBought or TokenSold events found.</td></tr>}</tbody></table></div>
    </Panel>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-slate-600">{label}</p><p className="mt-1 font-medium text-slate-200">{value}</p></div>;
}
