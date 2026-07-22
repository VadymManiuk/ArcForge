"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import type { TokenData } from "@/lib/types";
import { money, number } from "@/lib/utils";
import { Badge, Button, Progress, RiskBadge, TokenIcon } from "./ui";

const filters = ["Onchain", "All", "Trending", "Graduating", "Low risk", "Demo"];
type SortKey = "volume24h" | "marketCap" | "riskScore" | "curveProgress";
type OnchainState = "loading" | "live" | "cached" | "unavailable";

export function TokenTable({
  tokens,
  compact = false,
  onchainState = "live",
}: {
  tokens: TokenData[];
  compact?: boolean;
  onchainState?: OnchainState;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Onchain");
  const [sort, setSort] = useState<SortKey>("volume24h");
  const shown = useMemo(() => tokens.filter((token) => {
    const matchesSearch = [token.name, token.ticker, token.address, token.creator]
      .some((value) => value.toLowerCase().includes(query.toLowerCase()));
    if (!matchesSearch) return false;
    if (filter === "Onchain") return token.source === "onchain";
    if (filter === "Demo") return token.source === "demo";
    if (filter === "Trending") return token.volume1h > 25_000;
    if (filter === "Graduating") return token.curveProgress >= 75 && token.curveProgress < 100;
    if (filter === "Low risk") return token.riskScore >= 80;
    return true;
  }).sort((left, right) => {
    if (left.source !== right.source) return left.source === "onchain" ? -1 : 1;
    return right[sort] - left[sort];
  }), [tokens, query, filter, sort]);

  return <div className="panel overflow-hidden">
    {!compact && <div className="border-b border-line p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => <Button
            key={item}
            type="button"
            variant="ghost"
            onClick={() => setFilter(item)}
            className={filter === item ? "h-8 shrink-0 bg-white/[.07] px-3 text-white" : "h-8 shrink-0 px-3 text-slate-500"}
          >{item}</Button>)}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 md:flex">
          <label className="relative min-w-0">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-600"/>
            <input className="input h-9 w-full pl-9 md:w-64" placeholder="Token, ticker, address…" value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <label className="relative min-w-0">
            <ArrowUpDown className="absolute left-3 top-2.5 size-4 text-slate-600"/>
            <select className="input h-9 appearance-none pl-9 pr-7" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="volume24h">Volume</option><option value="marketCap">Market cap</option><option value="riskScore">Risk score</option><option value="curveProgress">Curve</option>
            </select>
          </label>
        </div>
      </div>
    </div>}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3 md:hidden">
      {shown.map((token) => {
        const awaitingLive = token.source === "onchain" && (onchainState === "loading" || onchainState === "unavailable");
        const progressLabel = token.curveProgress > 0 && token.curveProgress < 0.01 ? "<0.01%" : `${token.curveProgress.toFixed(2)}%`;
        return <Link key={token.address} href={`/tokens/${token.address}`} className="min-w-0 rounded-xl border border-line bg-black/15 p-4 transition active:border-cyan/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><TokenIcon label={token.icon} image={token.image}/><div className="min-w-0"><p className="truncate font-semibold text-white">{token.name}</p><div className="mt-1 flex items-center gap-2"><span className="font-mono text-[10px] text-slate-500">{token.ticker}</span><Badge tone={token.source === "onchain" && onchainState === "live" ? "good" : "neutral"}>{token.source === "onchain" ? onchainState === "loading" ? "Reading…" : onchainState === "cached" ? "Cached" : onchainState === "unavailable" ? "Unavailable" : "Onchain" : "Demo"}</Badge></div></div></div>
            <RiskBadge score={token.riskScore}/>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <MobileMetric label="Price" value={awaitingLive ? "—" : money(token.price)}/>
            <MobileMetric label="Volume" value={awaitingLive ? "—" : money(token.volume24h, true)}/>
            <MobileMetric label="Holders" value={token.source === "onchain" && token.holders === 0 ? "—" : number(token.holders)}/>
          </div>
          <div className="mt-4"><div className="mb-2 flex items-center justify-between font-mono text-[9px] text-slate-500"><span>Curve {awaitingLive ? "—" : progressLabel}</span><span>{money(token.targetUSDC, true)}</span></div><Progress value={awaitingLive ? 0 : token.curveProgress}/></div>
          <div className="mt-4 flex items-center justify-between"><Badge tone={token.status === "Flagged" ? "bad" : token.status === "Graduated" ? "good" : token.status === "Graduating soon" ? "warn" : "cyan"}>{token.status}</Badge><span className="text-xs font-semibold text-cyan">Open market →</span></div>
        </Link>;
      })}
      {shown.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No tokens match this view.</div>}
    </div>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1040px] text-left text-xs [&_td]:px-3 [&_th]:px-3">
        <thead><tr className="border-b border-line bg-white/[.012] text-[10px] text-slate-500"><th className="px-4 py-3 font-medium">Token</th><th className="font-medium">Price / 24h</th><th className="font-medium">Market cap</th><th className="font-medium">Volume</th><th className="font-medium">Trades</th><th className="font-medium">Holders</th><th className="w-36 font-medium">Curve</th><th className="font-medium">Risk</th><th></th></tr></thead>
        <tbody>{shown.map((token) => {
          const awaitingLive = token.source === "onchain" && (onchainState === "loading" || onchainState === "unavailable");
          const progressLabel = token.curveProgress > 0 && token.curveProgress < 0.01 ? "<0.01%" : `${token.curveProgress.toFixed(2)}%`;
          return <tr key={token.address} className="border-b border-line/60 transition last:border-0 hover:bg-white/[.025]">
            <td className="px-4 py-3"><Link href={`/tokens/${token.address}`} className="flex items-center gap-3"><TokenIcon label={token.icon} image={token.image}/><div><div className="flex items-center gap-2"><p className="font-semibold text-white">{token.name}</p>{token.source === "onchain" ? <Badge tone={onchainState === "unavailable" || onchainState === "cached" ? "neutral" : "good"}>{onchainState === "loading" ? "Reading…" : onchainState === "cached" ? "Cached" : onchainState === "unavailable" ? "Unavailable" : "Onchain"}</Badge> : <Badge tone="neutral">Demo</Badge>}</div><div className="mt-1 flex items-center gap-2"><span className="font-mono text-[10px] text-slate-500">{token.ticker}</span><span className="text-[10px] text-slate-600">{token.status}</span></div></div></Link></td>
            <td>{awaitingLive ? <span className="text-slate-600">—</span> : <><p className="text-slate-200">{money(token.price)}</p><p className={token.priceChange24h >= 0 ? "mt-1 text-emerald-400" : "mt-1 text-rose-400"}>{token.source === "onchain" ? "Since launch " : ""}{token.priceChange24h > 0 ? "+" : ""}{token.priceChange24h.toFixed(2)}%</p></>}</td>
            <td className="text-slate-300">{awaitingLive ? "—" : money(token.marketCap, true)}</td>
            <td className="text-slate-300">{awaitingLive ? "Reading…" : money(token.volume24h, true)}</td>
            <td className="text-slate-400">{awaitingLive ? "—" : number(token.trades)}</td>
            <td className="text-slate-400">{token.source === "onchain" && token.holders === 0 ? "—" : number(token.holders)}</td>
            <td className="pr-5"><div className="mb-1.5 flex justify-between text-[10px] text-slate-500"><span>{awaitingLive ? "—" : progressLabel}</span><span>{money(token.targetUSDC, true)}</span></div><Progress value={awaitingLive ? 0 : token.curveProgress}/></td>
            <td><RiskBadge score={token.riskScore}/></td>
            <td className="pr-4"><Link href={`/tokens/${token.address}`} className="font-semibold text-cyan">Trade →</Link></td>
          </tr>;
        })}</tbody>
      </table>
      {shown.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No tokens match this view.</div>}
    </div>
  </div>;
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 truncate text-slate-200">{value}</p></div>;
}
