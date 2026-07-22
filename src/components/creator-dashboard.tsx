"use client";

import { useFactoryTokenIndex } from "@/hooks/use-factory-token-index";
import { mockTokens } from "@/lib/mock-data";
import { money } from "@/lib/utils";
import { Badge, EmptyState, Progress, StatCard, WarningBox } from "./ui";
import { TokenTable } from "./token-table";

export function CreatorDashboard({ address }: { address: string }) {
  const { tokens: indexedTokens, loading, error, refresh, isCached, isPartial } = useFactoryTokenIndex();
  const normalized = address.toLowerCase();
  const onchainTokens = indexedTokens.filter((token) => token.creator.toLowerCase() === normalized);
  const demoTokens = mockTokens.filter((token) => token.creator.toLowerCase() === normalized);
  const tokens = onchainTokens.length > 0 ? onchainTokens : demoTokens;
  const source = onchainTokens.length > 0 ? "onchain" : demoTokens.length > 0 ? "demo" : null;
  const profile = tokens[0]?.creatorProfile;
  const volume = tokens.reduce((sum, token) => sum + token.volume24h, 0);
  const graduated = tokens.filter((token) => token.status === "Graduated").length;
  const onchainState = isPartial ? "unavailable" : isCached ? "cached" : loading ? "loading" : "live";

  if (!source && loading) return <div className="container-shell pb-20"><EmptyState title="Reading Factory history…" body="Checking confirmed Arc Testnet launches for this wallet."/></div>;
  if (!source) return <div className="container-shell pb-20"><div className="mb-5"><WarningBox>{error || "No Factory launch or clearly labeled demo profile was found for this wallet."}</WarningBox></div><EmptyState title="No indexed creator history" body="ArcOrigin does not substitute another creator's profile when this wallet has no indexed launches."/></div>;

  const reputation = source === "onchain" ? profile?.reputation ?? 50 : profile?.reputation ?? 0;
  return <div className="container-shell pb-20">
    <div className="mb-5 flex flex-wrap items-center gap-2"><Badge tone={source === "onchain" ? "good" : "neutral"}>{source === "onchain" ? isCached ? "Cached onchain profile" : "Onchain creator" : "Demo profile"}</Badge>{source === "onchain" && <Badge tone="neutral">Unverified metadata</Badge>}{tokens.length === 1 && <Badge tone="neutral">New creator</Badge>}</div>
    {error && source === "onchain" && <div className="mb-5 flex items-center gap-3"><div className="flex-1"><WarningBox>{isCached ? `Showing the last confirmed cached snapshot. ${error}` : error}</WarningBox></div><button onClick={() => void refresh()} className="shrink-0 text-xs font-semibold text-cyan">Retry live data</button></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Reputation" value={`${reputation}/100`} detail="Informational score"/><StatCard label="Indexed launches" value={String(tokens.length)} detail={source === "onchain" ? "Factory events" : "Demo data"}/><StatCard label="Graduated" value={String(graduated)} detail={source === "onchain" ? "Confirmed status" : "Demo status"}/><StatCard label="Tracked volume" value={source === "onchain" && isPartial ? "—" : money(volume,true)} detail={source === "onchain" ? "Confirmed curve events" : "Simulated volume"}/></div>
    <div className="panel my-6 p-5"><div className="flex justify-between text-xs"><span className="text-slate-500">Creator reputation</span><span className="text-slate-300">{reputation}/100</span></div><div className="mt-3"><Progress value={reputation}/></div><p className="mt-3 text-xs text-slate-500">This informational score uses currently indexed launch history and does not guarantee future behavior. Social verification is not enabled.</p></div>
    <h2 className="mb-4 text-xl font-semibold text-white">Created tokens</h2><TokenTable tokens={tokens} compact onchainState={source === "onchain" ? onchainState : "live"}/>
  </div>;
}
