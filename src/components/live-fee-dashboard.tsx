"use client";

import { useCallback, useEffect, useState } from "react";
import { RevenueChart, type RevenuePoint } from "@/components/revenue-chart";
import { AddressPill, ArcscanLink, Badge, Button, Panel, StatCard, WarningBox } from "@/components/ui";
import { ARC_TESTNET_CONTRACTS } from "@/lib/chains";
import type { FeeRow } from "@/lib/onchain/fee-snapshot";
import { money } from "@/lib/utils";

type FeeSnapshot = {
  totalCollected: number;
  vaultBalance: number;
  launchFees: number;
  buyFees: number;
  sellFees: number;
  chart: RevenuePoint[];
  rows: FeeRow[];
  indexedBlock: string;
  generatedAt: string;
};

function exactUsdc(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export function LiveFeeDashboard() {
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const refresh = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/onchain/fees${forceRefresh ? "?refresh=1" : ""}`);
      const payload = await response.json() as { snapshot?: FeeSnapshot; stale?: boolean; error?: string };
      if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Live fee data is unavailable.");
      setSnapshot(payload.snapshot);
      setStale(Boolean(payload.stale));
      if (payload.stale) setError("Showing the latest confirmed snapshot while Arc Testnet RPC recovers.");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message || "Live fee data could not be loaded from Arc Testnet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleTrade = () => void refresh(true);
    window.addEventListener("arcforge:trade-confirmed", handleTrade);
    return () => window.removeEventListener("arcforge:trade-confirmed", handleTrade);
  }, [refresh]);

  if (!snapshot) return <div className="container-shell pb-20"><Panel className="p-5"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Onchain fee accounting</p><p className="mt-2 text-sm text-slate-400">{loading ? "Loading the cached FeeVault snapshot…" : "Live data unavailable"}</p></div>{!loading && <Button variant="ghost" onClick={() => void refresh(true)}>Retry</Button>}</div>{error && <WarningBox>{error}</WarningBox>}</Panel></div>;

  return <div className="container-shell pb-20">
    <div className="mb-3 flex justify-end gap-2"><Badge tone="neutral">Block {snapshot.indexedBlock}</Badge><Badge tone={loading || stale ? "neutral" : "good"}>{loading ? "Updating…" : stale ? "Last confirmed" : "Live FeeVault"}</Badge></div>
    {error && <div className="mb-5"><WarningBox>{error}</WarningBox></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total collected" value={exactUsdc(snapshot.totalCollected)} detail="FeeReceived events"/>
      <StatCard label="Vault balance" value={exactUsdc(snapshot.vaultBalance)} detail="Current USDC balance"/>
      <StatCard label="Launch fees" value={money(snapshot.launchFees)} detail="25 USDC / launch"/>
      <StatCard label="Trading fees" value={money(snapshot.buyFees + snapshot.sellFees)} detail="Buy and sell fees"/>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
      <Panel className="p-5"><div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Cumulative fees</p><h2 className="mt-2 text-lg font-semibold">Confirmed FeeReceived events</h2></div><Button variant="ghost" disabled={loading} onClick={() => void refresh(true)}>Refresh</Button></div><RevenueChart data={snapshot.chart}/></Panel>
      <Panel className="p-5"><p className="eyebrow">Fee model</p><dl className="mt-5 grid gap-4 text-sm">{[["Launch fee", "25 USDC", "On token creation"], ["Buy fee", "1.00%", "Of USDC input"], ["Sell fee", "1.00%", "Of gross USDC output"], ["Migration fee", "Not enabled", "No migration charge"]].map(([label, value, note]) => <div key={label} className="border-b border-line pb-3 last:border-0"><div className="flex justify-between"><dt className="text-slate-400">{label}</dt><dd className="font-medium text-white">{value}</dd></div><p className="mt-1 text-[10px] text-slate-600">{note}</p></div>)}</dl><div className="mt-5 rounded-xl border border-line bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Fee vault</p><div className="mt-2 flex items-center justify-between"><AddressPill address={ARC_TESTNET_CONTRACTS.feeVault}/><Badge tone="good">Deployed</Badge></div></div></Panel>
    </div>
    <Panel className="mt-5 overflow-hidden"><div className="border-b border-line p-5"><p className="eyebrow">FeeVault activity</p><h2 className="mt-2 text-lg font-semibold">Confirmed fee events</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs [&_td]:px-4 [&_th]:px-4"><thead><tr className="border-b border-line font-mono text-[9px] uppercase tracking-wider text-slate-600"><th className="py-3">Block</th><th>Source</th><th>Amount</th><th>Payer / recipient</th><th>Transaction</th><th>Status</th></tr></thead><tbody>{snapshot.rows.map((row) => <tr key={`${row.transactionHash}-${row.logIndex}`} className="border-b border-line/60 last:border-0"><td className="py-3 text-slate-500">{row.blockNumber.toString()}</td><td><Badge tone={row.source === "Launch" ? "cyan" : row.source === "Buy" ? "good" : row.source === "Sell" ? "bad" : "neutral"}>{row.source}</Badge></td><td className={row.source === "Withdrawal" ? "text-rose-300" : "text-slate-300"}>{row.source === "Withdrawal" ? "−" : ""}{money(row.amount)}</td><td><AddressPill address={row.account}/></td><td><ArcscanLink hash={row.transactionHash}/></td><td><Badge tone="good">Onchain</Badge></td></tr>)}{snapshot.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No FeeReceived or FeeWithdrawn events found.</td></tr>}</tbody></table></div></Panel>
  </div>;
}
