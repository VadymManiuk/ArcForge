"use client";

import { useCallback, useEffect, useState } from "react";
import { AtSign, ExternalLink, Globe, RefreshCw, ShieldCheck } from "lucide-react";
import { PnlShareCard } from "@/components/pnl-share-card";
import { TokenChart } from "@/components/token-chart";
import { AddressPill, ArcscanLink, Badge, Button, Panel, Progress, RiskBadge, WarningBox } from "@/components/ui";
import { useHolderSnapshot } from "@/hooks/use-holder-snapshot";
import { usesPermanentLiquidityMode } from "@/lib/bonding-curve";
import { EXPLORER_URL } from "@/lib/chains";
import { loadIndexedMarketSnapshot } from "@/lib/onchain/market-event-snapshot";
import type { MarketSnapshot } from "@/lib/onchain/market-snapshot";
import type { TokenData } from "@/lib/types";
import { money, number } from "@/lib/utils";

export type OnchainTokenSnapshot = MarketSnapshot;
type TerminalTab = "Trades" | "Holders" | "Curve" | "Info";

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
  const [activeTab, setActiveTab] = useState<TerminalTab>("Trades");
  const {
    snapshot: holderSnapshot,
    loading: holderLoading,
    error: holderError,
    refresh: refreshHolders,
  } = useHolderSnapshot(token, activeTab === "Holders");

  const permanentLiquidityMode = usesPermanentLiquidityMode(token.virtualUsdcReserve, token.targetUSDC);
  const effectiveQuoteDepth = snapshot.graduated && permanentLiquidityMode
    ? snapshot.raisedUsdc
    : (token.virtualUsdcReserve ?? 0) + snapshot.raisedUsdc;
  const remainingToGraduation = Math.max(0, token.targetUSDC - snapshot.raisedUsdc);
  const progressLabel = snapshot.progress > 0 && snapshot.progress < 0.01 ? "<0.01%" : `${snapshot.progress.toFixed(2)}%`;
  const buyTrades = snapshot.trades.filter((trade) => trade.type === "Buy");
  const sellTrades = snapshot.trades.filter((trade) => trade.type === "Sell");
  const buyVolume = buyTrades.reduce((sum, trade) => sum + trade.usdc, 0);
  const sellVolume = sellTrades.reduce((sum, trade) => sum + trade.usdc, 0);
  const totalFlow = buyVolume + sellVolume;
  const buyShare = totalFlow > 0 ? buyVolume / totalFlow * 100 : 50;
  const netFlow = buyVolume - sellVolume;
  const tabs: Array<{ label: TerminalTab; count?: string }> = [
    { label: "Trades", count: String(snapshot.trades.length) },
    { label: "Holders", count: holderSnapshot ? number(holderSnapshot.holders) : token.holders > 0 ? number(token.holders) : undefined },
    { label: "Curve" },
    { label: "Info" },
  ];

  return <Panel className="overflow-hidden rounded-xl shadow-none">
    <div className="grid grid-cols-2 border-b border-line bg-black/10 sm:grid-cols-3 xl:grid-cols-6">
      <TerminalMetric label="Price" value={tokenPrice(snapshot.price)} />
      <TerminalMetric label="Market cap" value={money(snapshot.marketCap, true)} />
      <TerminalMetric label="Liquidity" value={money(snapshot.raisedUsdc, true)} detail="Real USDC" />
      <TerminalMetric label="Volume" value={money(snapshot.volume, true)} detail={`${buyTrades.length} buys · ${sellTrades.length} sells`} />
      <TerminalMetric label="Holders" value={holderSnapshot ? number(holderSnapshot.holders) : token.holders > 0 ? number(token.holders) : "—"} />
      <TerminalMetric
        label="Since launch"
        value={`${snapshot.priceChange >= 0 ? "+" : ""}${snapshot.priceChange.toFixed(2)}%`}
        tone={snapshot.priceChange >= 0 ? "good" : "bad"}
      />
    </div>

    <div className="border-b border-line p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={loading || stale ? "neutral" : "good"}>{loading ? "Refreshing" : stale ? "Cached" : "Live onchain"}</Badge>
          <span className="font-mono text-[9px] text-slate-600">Block {snapshot.indexedBlock}</span>
        </div>
        <div className="flex items-center gap-1">
          <PnlShareCard token={token} snapshot={snapshot} />
          <Button variant="ghost" className="h-8 px-2.5 text-xs" disabled={loading} onClick={() => void refresh(true)}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>
      <div className="mb-3 grid gap-2 rounded-xl border border-line bg-black/15 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex items-center justify-between gap-4 text-[10px]">
            <span className="text-emerald-300">Buy volume {money(buyVolume)} · {buyTrades.length}</span>
            <span className="text-rose-300">Sell volume {money(sellVolume)} · {sellTrades.length}</span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[.05]">
            <div className="bg-emerald-400 transition-[width]" style={{ width: `${buyShare}%` }} />
            <div className="bg-rose-400 transition-[width]" style={{ width: `${100 - buyShare}%` }} />
          </div>
        </div>
        <div className="text-left sm:min-w-28 sm:text-right">
          <p className="font-mono text-[8px] uppercase tracking-wider text-slate-600">Net flow</p>
          <p className={`mt-1 text-xs font-semibold ${netFlow >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{netFlow >= 0 ? "+" : "−"}{money(Math.abs(netFlow))}</p>
        </div>
      </div>
      <TokenChart data={snapshot.chart}/>
      {error && <div className="mt-3"><WarningBox>{error}</WarningBox></div>}
    </div>

    <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-black/10 px-2">
      {tabs.map((tab) => <button
        key={tab.label}
        type="button"
        onClick={() => setActiveTab(tab.label)}
        className={`relative flex h-11 shrink-0 items-center gap-2 px-3 text-xs font-medium transition ${activeTab === tab.label ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
      >
        {tab.label}
        {tab.count && <span className="font-mono text-[9px] text-slate-600">{tab.count}</span>}
        {activeTab === tab.label && <span className="absolute inset-x-3 bottom-0 h-px bg-cyan" />}
      </button>)}
    </div>

    <div className="min-h-[260px]">
      {activeTab === "Trades" && <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="border-b border-line font-mono text-[9px] uppercase tracking-wider text-slate-600"><th className="px-4 py-3">Block</th><th>Type</th><th>Wallet</th><th>USDC</th><th>Tokens</th><th>Price</th><th>Transaction</th></tr></thead>
          <tbody>{snapshot.trades.map((trade) => <tr key={trade.txHash} className="border-b border-line/60 last:border-0 hover:bg-white/[.02]"><td className="px-4 py-3 text-slate-500">{trade.time}</td><td><Badge tone={trade.type === "Buy" ? "good" : "bad"}>{trade.type}</Badge></td><td><AddressPill address={trade.wallet}/></td><td className={trade.type === "Buy" ? "text-emerald-300" : "text-rose-300"}>{money(trade.usdc)}</td><td className="text-slate-300">{number(trade.tokens)}</td><td className="text-slate-400">{tokenPrice(trade.price)}</td><td><ArcscanLink hash={trade.txHash}/></td></tr>)}
          {snapshot.trades.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No confirmed trades yet. The first buy will appear here onchain.</td></tr>}</tbody>
        </table>
      </div>}

      {activeTab === "Holders" && <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Holder distribution</p><p className="mt-2 text-sm text-slate-400">Confirmed holder balances, cached locally for instant repeat visits.</p></div><div className="flex items-center gap-2"><Badge tone={holderSnapshot ? "good" : "neutral"}>{holderLoading ? "Refreshing" : holderSnapshot ? "Onchain snapshot" : "Unavailable"}</Badge><Button variant="ghost" className="h-8 px-2.5 text-xs" disabled={holderLoading} onClick={() => void refreshHolders(true)}>Refresh</Button></div></div>
        {holderLoading && !holderSnapshot && <div className="mt-8 rounded-xl border border-line bg-black/15 px-4 py-10 text-center text-sm text-slate-500">Loading holder analytics in the background…</div>}
        {holderSnapshot && <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[["Creator", holderSnapshot.creatorPercent], ["Top 10 excluding curve", holderSnapshot.topTenExcludingCurvePercent], ["Trading curve", holderSnapshot.curvePercent], ["Permanent lock", holderSnapshot.permanentLiquidityLockPercent]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-line bg-black/15 p-4"><div className="mb-3 flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="text-slate-200">{Number(value).toFixed(2)}%</span></div><Progress value={Number(value)}/></div>)}</div>}
        {holderError && <div className="mt-4"><WarningBox>{holderError}</WarningBox></div>}
      </div>}

      {activeTab === "Curve" && <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{snapshot.graduated && permanentLiquidityMode ? "Permanent liquidity" : "Bonding curve"}</p><h2 className="mt-2 text-lg font-semibold text-white">{snapshot.graduated ? permanentLiquidityMode ? "Graduated · real-reserve AMM active" : "Graduated" : `${progressLabel} toward graduation`}</h2></div><div className="text-right"><p className="text-sm text-white">{money(snapshot.raisedUsdc)} / {money(token.targetUSDC)}</p><p className="mt-1 text-xs text-slate-500">Real USDC liquidity</p></div></div>
        <div className="my-5"><Progress value={snapshot.progress}/></div>
        <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-5"><Metric label="Tokens sold" value={number(snapshot.tokensSold)}/><Metric label="Curve inventory" value={number(snapshot.tokenReserve)}/><Metric label="Effective depth" value={money(effectiveQuoteDepth)}/><Metric label="Remaining" value={money(remainingToGraduation)}/><Metric label="After graduation" value={permanentLiquidityMode ? "Permanent AMM" : "Legacy curve"}/></div>
        <p className="mt-5 border-t border-line pt-4 text-[11px] leading-5 text-slate-500">{permanentLiquidityMode
          ? "At 100%, virtual liquidity is removed without changing the spot price. Price-matched tokens and all real USDC remain in the curve as permanent two-sided AMM liquidity; buys and sells continue."
          : "Legacy curve: real USDC backs sells, while virtual USDC shapes pricing. Buying closes at the configured threshold because this deployment predates permanent-liquidity graduation."}</p>
      </div>}

      {activeTab === "Info" && <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="eyebrow">About {token.ticker}</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{token.description || "No token description was published in the immutable launch metadata."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {token.socials.website && <InfoLink href={token.socials.website} icon={<Globe className="size-3.5"/>} label="Website"/>}
            {token.socials.x && <InfoLink href={token.socials.x} icon={<AtSign className="size-3.5"/>} label="X / Twitter"/>}
            <InfoLink href={`${EXPLORER_URL}/address/${token.address}`} icon={<ExternalLink className="size-3.5"/>} label="Arcscan"/>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">{token.riskLabels.map((label) => <Badge key={label} tone={label.includes("high") || label.includes("missing") ? "bad" : "good"}><ShieldCheck className="mr-1 size-3"/>{label.replaceAll("_", " ")}</Badge>)}</div>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">Risk labels describe visible onchain and metadata signals, not a guarantee of safety.</p>
        </div>
        <div className="rounded-xl border border-line bg-black/15 p-4">
          <div className="flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">Risk score</p><RiskBadge score={token.riskScore}/></div>
          <dl className="mt-5 grid gap-3 text-xs"><InfoRow label="Token" value={<AddressPill address={token.address}/>}/>{token.curveAddress && <InfoRow label="Curve" value={<AddressPill address={token.curveAddress}/>}/>}<InfoRow label="Creator" value={<AddressPill address={token.creator}/>}/><InfoRow label="Launch block" value={String(token.launchBlock ?? "—")}/></dl>
        </div>
      </div>}
    </div>
  </Panel>;
}

function tokenPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (value < 0.000001) return `$${value.toFixed(10)}`;
  if (value < 0.01) return `$${value.toFixed(8)}`;
  return money(value);
}

function TerminalMetric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "bad" }) {
  return <div className="min-w-0 border-b border-r border-line px-3 py-3 last:border-r-0 sm:px-4 xl:border-b-0"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">{label}</p><p className={`mt-1 truncate text-sm font-semibold ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white"}`}>{value}</p>{detail && <p className="mt-0.5 truncate text-[9px] text-slate-600">{detail}</p>}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-slate-600">{label}</p><p className="mt-1 font-medium text-slate-200">{value}</p></div>;
}

function InfoLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white/[.025] px-3 text-xs text-slate-300 transition hover:border-cyan/30 hover:text-white">{icon}{label}</a>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-300">{value}</dd></div>;
}
