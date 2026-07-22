"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import type { TokenData } from "@/lib/types";
import { age, money, number } from "@/lib/utils";
import { Badge, Button, Progress, RiskBadge, TokenIcon } from "./ui";

const filters = ["All", "New", "Trending", "Graduating soon", "High volume", "Low risk", "New creators", "Verified creators", "High risk", "Recently launched"];
type SortKey = "volume24h" | "marketCap" | "raisedUSDC" | "buyers" | "ageMinutes" | "riskScore" | "curveProgress";
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
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<SortKey>("volume24h");
  const shown = useMemo(() => tokens.filter((token) => {
    const matchesSearch = [token.name, token.ticker, token.address, token.creator]
      .some((value) => value.toLowerCase().includes(query.toLowerCase()));
    if (!matchesSearch) return false;
    if (filter === "New" || filter === "Recently launched") return token.source === "onchain" || token.ageMinutes < 120;
    if (filter === "Trending") return token.volume1h > 25_000;
    if (filter === "Graduating soon") return token.curveProgress >= 75 && token.curveProgress < 100;
    if (filter === "High volume") return token.volume24h > 150_000;
    if (filter === "Low risk") return token.riskScore >= 80;
    if (filter === "High risk") return token.riskScore < 60;
    if (filter === "New creators") return token.creatorProfile.launches <= 1;
    if (filter === "Verified creators") return token.creatorProfile.verified;
    return true;
  }).sort((left, right) => {
    if (left.source !== right.source) return left.source === "onchain" ? -1 : 1;
    return sort === "ageMinutes" ? left[sort] - right[sort] : right[sort] - left[sort];
  }), [tokens, query, filter, sort]);

  return <div className="panel overflow-hidden">
    <div className="border-b border-line p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.slice(0, compact ? 5 : undefined).map((item) => <Button
            key={item}
            variant="ghost"
            onClick={() => setFilter(item)}
            className={filter === item ? "h-8 shrink-0 bg-white/[.07] px-3 text-white" : "h-8 shrink-0 px-3 text-slate-500"}
          >{item}</Button>)}
        </div>
        {!compact && <div className="flex gap-2">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-600"/>
            <input className="input h-9 w-full pl-9 md:w-64" placeholder="Token, ticker, address…" value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <label className="relative">
            <ArrowUpDown className="absolute left-3 top-2.5 size-4 text-slate-600"/>
            <select className="input h-9 appearance-none pl-9 pr-8" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="volume24h">Volume</option><option value="marketCap">Market cap</option><option value="raisedUSDC">Raised</option><option value="buyers">Buyers</option><option value="ageMinutes">Age</option><option value="riskScore">Risk score</option><option value="curveProgress">Curve</option>
            </select>
          </label>
        </div>}
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1380px] text-left text-xs [&_td]:px-3 [&_th]:px-3">
        <thead><tr className="border-b border-line bg-white/[.015] font-mono text-[9px] uppercase tracking-[.14em] text-slate-600"><th className="px-4 py-3">Token</th><th>Age</th><th>Price / change</th><th>Market cap</th><th>Raised</th><th>Volume</th><th>Buy / Sell</th><th>Trades</th><th>Holders</th><th className="w-32">Curve</th><th>Risk</th><th>Status</th><th></th></tr></thead>
        <tbody>{shown.map((token) => {
          const awaitingLive = token.source === "onchain" && (onchainState === "loading" || onchainState === "unavailable");
          const progressLabel = token.curveProgress > 0 && token.curveProgress < 0.01 ? "<0.01%" : `${token.curveProgress.toFixed(2)}%`;
          return <tr key={token.address} className="border-b border-line/60 transition last:border-0 hover:bg-white/[.025]">
            <td className="px-4 py-3"><Link href={`/tokens/${token.address}`} className="flex items-center gap-3"><TokenIcon label={token.icon}/><div><div className="flex items-center gap-2"><p className="font-semibold text-white">{token.name}</p>{token.source === "onchain" ? <Badge tone={onchainState === "unavailable" || onchainState === "cached" ? "neutral" : "good"}>{onchainState === "loading" ? "Reading…" : onchainState === "cached" ? "Cached onchain" : onchainState === "unavailable" ? "RPC unavailable" : "Onchain"}</Badge> : <Badge tone="neutral">Demo</Badge>}</div><p className="mt-1 font-mono text-[10px] text-slate-500">{token.ticker}</p></div></Link></td>
            <td className="text-slate-400">{token.source === "onchain" ? "Arc Testnet" : age(token.ageMinutes)}</td>
            <td>{awaitingLive ? <span className="text-slate-600">—</span> : <><p className="text-slate-200">{money(token.price)}</p><p className={token.priceChange24h >= 0 ? "mt-1 text-emerald-400" : "mt-1 text-rose-400"}>{token.source === "onchain" ? "Since launch " : ""}{token.priceChange24h > 0 ? "+" : ""}{token.priceChange24h.toFixed(2)}%</p></>}</td>
            <td className="text-slate-300">{awaitingLive ? "—" : money(token.marketCap, true)}</td>
            <td className="text-slate-300">{awaitingLive ? "—" : money(token.raisedUSDC, true)}</td>
            <td className="font-mono text-[10px] text-slate-400">{awaitingLive ? "Reading Arc RPC…" : token.source === "onchain" ? <><span className="text-emerald-300">Onchain total</span> · {money(token.volume24h, true)}</> : <>{money(token.volume5m, true)} / {money(token.volume1h, true)} / <span className="text-slate-200">{money(token.volume24h, true)}</span></>}</td>
            <td>{awaitingLive ? <span className="text-slate-600">—</span> : <><span className="text-emerald-400">{token.buyers}</span><span className="mx-1 text-slate-700">/</span><span className="text-rose-400">{token.sellers}</span></>}</td>
            <td className="text-slate-400">{awaitingLive ? "—" : number(token.trades)}</td>
            <td className="text-slate-400">{token.source === "onchain" && token.holders === 0 ? "—" : number(token.holders)}</td>
            <td className="pr-5"><div className="mb-1.5 flex justify-between text-[10px] text-slate-500"><span>{awaitingLive ? "—" : progressLabel}</span><span>{money(token.targetUSDC, true)}</span></div><Progress value={awaitingLive ? 0 : token.curveProgress}/></td>
            <td><RiskBadge score={token.riskScore}/></td>
            <td><Badge tone={token.status === "Flagged" ? "bad" : token.status === "Graduated" ? "good" : token.status === "Graduating soon" ? "warn" : "cyan"}>{token.status}</Badge></td>
            <td className="pr-4"><Link href={`/tokens/${token.address}`} className="font-semibold text-cyan">Trade →</Link></td>
          </tr>;
        })}</tbody>
      </table>
      {shown.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No tokens match this view.</div>}
    </div>
  </div>;
}
