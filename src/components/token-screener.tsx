"use client";

import { useMemo } from "react";
import { TokenTable } from "@/components/token-table";
import { Button, StatCard, WarningBox } from "@/components/ui";
import { useFactoryTokenIndex } from "@/hooks/use-factory-token-index";
import { mockTokens } from "@/lib/mock-data";
import { money } from "@/lib/utils";

export function TokenScreener() {
  const { tokens: indexedTokens, loading, error, refresh, isCached, isPartial, cachedAt } = useFactoryTokenIndex();
  const tokens = useMemo(() => [...indexedTokens, ...mockTokens], [indexedTokens]);
  const liveState = indexedTokens.length > 0 && isPartial ? "unavailable" : indexedTokens.length > 0 && isCached ? "cached" : loading ? "loading" : indexedTokens.length > 0 ? "live" : "unavailable";
  const onchainVolume = indexedTokens.reduce((sum, token) => sum + token.volume24h, 0);
  const raised = indexedTokens.reduce((sum, token) => sum + token.raisedUSDC, 0);
  const trades = indexedTokens.reduce((sum, token) => sum + token.trades, 0);

  return <div className="container-shell pb-20">
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <StatCard label="Factory launches" value={loading && indexedTokens.length === 0 ? "—" : String(indexedTokens.length)} detail={isCached && cachedAt ? `Cached ${new Date(cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Confirmed onchain"}/>
      <StatCard label="Onchain volume" value={indexedTokens.length > 0 && !isPartial && !loading ? money(onchainVolume) : "—"} detail={isPartial ? "Live market data unavailable" : loading ? "Updating confirmed trades" : `${trades} confirmed trades`}/>
      <StatCard label="Curve reserves" value={indexedTokens.length > 0 && !isPartial && !loading ? money(raised) : "—"} detail={isPartial ? "Live market data unavailable" : loading ? "Updating reserves" : `${mockTokens.length} labeled demo listings available`}/>
    </div>
    {error && <div className="mb-5 flex items-center gap-3"><div className="flex-1"><WarningBox>{isCached && indexedTokens.length > 0 ? `Showing the last confirmed cached snapshot. ${error}` : error}</WarningBox></div><Button variant="ghost" onClick={() => void refresh()}>Retry live data</Button></div>}
    <TokenTable tokens={tokens} onchainState={liveState}/>
  </div>;
}
