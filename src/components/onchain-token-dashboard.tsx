"use client";

import { useCallback, useEffect, useState } from "react";
import { TokenChart } from "@/components/token-chart";
import { AddressPill, ArcscanLink, Badge, Button, Panel, Progress, StatCard, WarningBox } from "@/components/ui";
import type { HolderSnapshot } from "@/lib/onchain/holder-snapshot";
import { loadIndexedMarketSnapshot } from "@/lib/onchain/market-event-snapshot";
import type { MarketSnapshot } from "@/lib/onchain/market-snapshot";
import type { TokenData } from "@/lib/types";
import { money, number } from "@/lib/utils";

export type OnchainTokenSnapshot = MarketSnapshot;

function createIndexedFallback(token: TokenData): OnchainTokenSnapshot {
  const totalSupply = token.totalSupply ?? 1_000_000_000;
  const initialReserve = totalSupply * (1 - (token.creatorAllocationPercent ?? 0) / 100);
  const virtualUsdc = token.virtualUsdcReserve ?? 10_000;
  const raisedUsdc = Math.max(0, token.raisedUSDC);
  const tokenReserve = virtualUsdc + raisedUsdc > 0
    ? initialReserve * virtualUsdc / (virtualUsdc + raisedUsdc)
    : initialReserve;

  return {
    price: token.price,
    priceChange: token.priceChange24h,
    marketCap: token.marketCap,
    volume: token.volume24h,
    buyers: token.buyers,
    sellers: token.sellers,
    raisedUsdc,
    targetUsdc: token.targetUSDC,
    progress: token.curveProgress,
    graduated: token.status === "Graduated",
    tokensSold: Math.max(0, initialReserve - tokenReserve),
    tokenReserve,
    chart: token.chartData.length > 0 ? token.chartData : [{ time: "Launch", price: token.price, volume: 0 }],
    trades: token.recentTrades,
    indexedBlock: String(token.launchBlock ?? "Factory"),
    generatedAt: new Date().toISOString(),
  };
}

export function useOnchainTokenSnapshot(token: TokenData) {
  const [snapshot, setSnapshot] = useState<OnchainTokenSnapshot>(() => createIndexedFallback(token));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      try {
        setSnapshot(await loadIndexedMarketSnapshot(token));
        setStale(false);
      } catch {
        const response = await fetch(`/api/onchain/tokens/${token.address}/market${forceRefresh ? "?refresh=1" : ""}`, {
          signal: AbortSignal.timeout(12_000),
        });
        const payload = await response.json() as { snapshot?: OnchainTokenSnapshot; stale?: boolean; error?: string };
        if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Market data is unavailable.");
        setSnapshot(payload.snapshot);
        setStale(Boolean(payload.stale));
        if (payload.stale) setError("Showing the latest confirmed market snapshot while Arc Testnet RPC recovers.");
      }
    } catch (loadError) {
      setStale(true);
      const message = loadError instanceof Error ? loadError.message : "Live market data could not be loaded.";
      setError(`Showing the latest Factory snapshot. ${message}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const handleTrade = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      if (detail?.tokenAddress?.toLowerCase() === token.address.toLowerCase()) void refresh(true);
    };
    window.addEventListener("arcforge:trade-confirmed", handleTrade);
    return () => window.removeEventListener("arcforge:trade-confirmed", handleTrade);
  }, [refresh, token.address]);

  return { snapshot, loading, error, stale, refresh };
}

export function OnchainTokenDashboard({ token }: { token: TokenData }) {
  const { snapshot, loading, error, stale, refresh } = useOnchainTokenSnapshot(token);
  const [holderSnapshot, setHolderSnapshot] = useState<HolderSnapshot | null>(null);
  const [holderLoading, setHolderLoading] = useState(true);
  const [holderError, setHolderError] = useState("");
  const [holderStale, setHolderStale] = useState(false);
  const refreshHolders = useCallback(async (forceRefresh = false) => {
    setHolderLoading(true);
    setHolderError("");
    try {
      const response = await fetch(`/api/onchain/tokens/${token.address}/holders${forceRefresh ? "?refresh=1" : ""}`);
      const payload = await response.json() as { snapshot?: HolderSnapshot; stale?: boolean; error?: string };
      if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Holder data is unavailable.");
      setHolderSnapshot(payload.snapshot);
      setHolderStale(Boolean(payload.stale));
      if (payload.stale) setHolderError("Showing the latest confirmed holder snapshot while Arc Testnet RPC recovers.");
    } catch (holderLoadError) {
      setHolderError(holderLoadError instanceof Error ? holderLoadError.message : "Holder data could not be indexed.");
    } finally {
      setHolderLoading(false);
    }
  }, [token.address]);

  useEffect(() => {
    void refreshHolders();
    const handleTrade = (event: Event) => {
      const detail = (event as CustomEvent<{ tokenAddress?: string }>).detail;
      if (detail?.tokenAddress?.toLowerCase() === token.address.toLowerCase()) void refreshHolders(true);
    };
    window.addEventListener("arcforge:trade-confirmed", handleTrade);
    return () => window.removeEventListener("arcforge:trade-confirmed", handleTrade);
  }, [refreshHolders, token.address]);

  const progressLabel = snapshot.progress > 0 && snapshot.progress < 0.01 ? "<0.01%" : `${snapshot.progress.toFixed(2)}%`;
  return <>
    <Panel className="p-5">
      <div className="mb-3 flex justify-end gap-2"><Badge tone="neutral">Block {snapshot.indexedBlock}</Badge><Badge tone={loading || stale ? "neutral" : "good"}>{loading ? "Updating…" : stale ? "Last confirmed" : "Live indexed"}</Badge></div>
      <TokenChart data={snapshot.chart}/>
      {error && <WarningBox>{error}</WarningBox>}
    </Panel>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Market cap" value={money(snapshot.marketCap, true)} detail="Current curve price × supply"/>
      <StatCard label="Onchain volume" value={money(snapshot.volume)} detail={`${snapshot.trades.length} confirmed trades`}/>
      <StatCard label="Holders" value={holderLoading && !holderSnapshot ? "—" : holderSnapshot ? number(holderSnapshot.holders) : "Unavailable"} detail={holderSnapshot ? `Transfer events · block ${holderSnapshot.indexedBlock}` : "Factory-validated index"}/>
      <StatCard label="Since launch" value={`${snapshot.priceChange >= 0 ? "+" : ""}${snapshot.priceChange.toFixed(2)}%`} className={snapshot.priceChange >= 0 ? "text-emerald-300" : "text-rose-300"}/>
    </div>
    <Panel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Holder distribution</p><h2 className="mt-2 text-lg font-semibold text-white">Indexed from Transfer events</h2></div><div className="flex gap-2"><Badge tone={holderLoading || holderStale ? "neutral" : "good"}>{holderLoading ? "Updating…" : holderStale ? "Last confirmed" : "Live holders"}</Badge><Button variant="ghost" disabled={holderLoading} onClick={() => void refreshHolders(true)}>Refresh</Button></div></div>
      {holderSnapshot && <div className="mt-5 grid gap-5 md:grid-cols-3">{[["Creator", holderSnapshot.creatorPercent], ["Top 10 excluding curve", holderSnapshot.topTenExcludingCurvePercent], ["Bonding curve", holderSnapshot.curvePercent]].map(([label, value]) => <div key={String(label)}><div className="mb-2 flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="text-slate-300">{Number(value).toFixed(2)}%</span></div><Progress value={Number(value)}/></div>)}</div>}
      {holderError && <WarningBox>{holderError}</WarningBox>}
    </Panel>
    <Panel className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Bonding curve</p><h2 className="mt-2 text-xl font-semibold text-white">{progressLabel} toward graduation</h2></div><div className="text-right"><p className="text-sm text-white">{money(snapshot.raisedUsdc)} / {money(token.targetUSDC)}</p><p className="mt-1 text-xs text-slate-500">USDC raised</p></div></div>
      <div className="my-5"><Progress value={snapshot.progress}/></div>
      <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-4"><Metric label="Tokens sold" value={number(snapshot.tokensSold)}/><Metric label="Curve inventory" value={number(snapshot.tokenReserve)}/><Metric label="Buys / sells" value={`${snapshot.buyers} / ${snapshot.sellers}`}/><Metric label="Migration" value="Not enabled"/></div>
    </Panel>
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5"><div><p className="eyebrow">Event activity</p><h2 className="mt-2 text-lg font-semibold">Recent onchain trades</h2></div><Button variant="ghost" disabled={loading} onClick={() => void refresh(true)}>Refresh</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-line font-mono text-[9px] uppercase tracking-wider text-slate-600"><th className="px-5 py-3">Block</th><th>Type</th><th>Wallet</th><th>USDC</th><th>Tokens</th><th>Price</th><th>Transaction</th></tr></thead><tbody>{snapshot.trades.map((trade) => <tr key={trade.txHash} className="border-b border-line/60 last:border-0"><td className="px-5 py-3 text-slate-500">{trade.time}</td><td><Badge tone={trade.type === "Buy" ? "good" : "bad"}>{trade.type}</Badge></td><td><AddressPill address={trade.wallet}/></td><td className="text-slate-300">{money(trade.usdc)}</td><td className="text-slate-300">{number(trade.tokens)}</td><td className="text-slate-400">{money(trade.price)}</td><td><ArcscanLink hash={trade.txHash}/></td></tr>)}{snapshot.trades.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No TokenBought or TokenSold events found.</td></tr>}</tbody></table></div>
    </Panel>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-slate-600">{label}</p><p className="mt-1 font-medium text-slate-200">{value}</p></div>;
}
