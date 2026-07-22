"use client";

import { useMemo } from "react";
import { useOnchainTokenSnapshot } from "@/components/onchain-token-dashboard";
import { TokenTable } from "@/components/token-table";
import { Button, StatCard, WarningBox } from "@/components/ui";
import { genesisToken, mockTokens } from "@/lib/mock-data";
import type { TokenData } from "@/lib/types";
import { money } from "@/lib/utils";

export function TokenScreener() {
  const { snapshot, loading, error, refresh } = useOnchainTokenSnapshot(genesisToken);
  const liveToken = useMemo<TokenData>(() => snapshot ? {
    ...genesisToken,
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
  } : genesisToken, [snapshot]);
  const tokens = useMemo(() => [liveToken, ...mockTokens], [liveToken]);
  const liveState = snapshot ? "live" : loading ? "loading" : "unavailable";

  return <div className="container-shell pb-20">
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Tracked launches" value={String(tokens.length)} detail="1 onchain · 10 demo"/>
      <StatCard label="AFG price" value={snapshot ? money(snapshot.price) : "—"} detail={snapshot ? "Live curve price" : "Reading Arc RPC"}/>
      <StatCard label="AFG onchain volume" value={snapshot ? money(snapshot.volume) : "—"} detail={snapshot ? `${snapshot.trades.length} confirmed trades` : "No simulated fallback"}/>
      <StatCard label="AFG raised" value={snapshot ? money(snapshot.raisedUsdc) : "—"} detail="Toward 50,000 USDC"/>
    </div>
    {error && <div className="mb-5 flex items-center gap-3"><div className="flex-1"><WarningBox>{error}</WarningBox></div><Button variant="ghost" onClick={() => void refresh()}>Retry live data</Button></div>}
    <TokenTable tokens={tokens} onchainState={liveState}/>
  </div>;
}
