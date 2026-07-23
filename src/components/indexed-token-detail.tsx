"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { BuySellPanel } from "@/components/buy-sell-panel";
import { OnchainTokenDashboard } from "@/components/onchain-token-dashboard";
import { AddressPill, Badge, Button, Panel, RiskBadge, TokenIcon, WarningBox } from "@/components/ui";
import { useFactoryTokenIndex } from "@/hooks/use-factory-token-index";
import { EXPLORER_URL } from "@/lib/chains";
import { shortAddress, utcDateTime } from "@/lib/utils";

export function IndexedTokenDetail({ address }: { address: string }) {
  const { tokens, loading, error, refresh } = useFactoryTokenIndex({ includeMarketData: false, allowCache: false });
  const token = tokens.find((item) => item.address.toLowerCase() === address.toLowerCase());

  if (!token) {
    return <div className="container-shell py-12">
      <Panel className="p-6">
        <p className="eyebrow">Factory index</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">{loading ? "Indexing Arc Testnet launch…" : "Launch not found"}</h1>
        <p className="mt-3 text-sm text-slate-400">{error || (loading ? "Reading TokenLaunched and curve events without a simulated fallback." : "This address was not emitted by the configured ArcOrigin factory.")}</p>
        <div className="mt-5 flex gap-3">
          {!loading && <Button onClick={() => void refresh()}>Retry index</Button>}
          <Link href="/tokens" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm text-slate-300">Back to markets</Link>
        </div>
        {error && <div className="mt-4"><WarningBox>{error}</WarningBox></div>}
      </Panel>
    </div>;
  }

  return <div className="mx-auto w-full max-w-[1800px] px-3 py-3 sm:px-4">
    <div className="mb-3 flex flex-col justify-between gap-4 rounded-xl border border-line bg-panel px-3 py-3 sm:px-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/tokens" aria-label="Back to markets" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-slate-500 transition hover:text-white"><ArrowLeft className="size-4"/></Link>
        <TokenIcon label={token.icon} image={token.image} className="size-11 rounded-xl text-sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-white sm:text-xl">{token.name}</h1>
            <span className="font-mono text-xs text-slate-500">{token.ticker}</span>
            <Badge tone="cyan">{token.status}</Badge>
            <Badge tone="good">Onchain</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <AddressPill address={token.address} />
            <span>{utcDateTime(token.launchedAt)}</span>
            <span>Creator <Link href={`/creators/${token.creator}`} className="text-slate-300 hover:text-cyan">{shortAddress(token.creator)}</Link></span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-12 lg:pl-0">
        <RiskBadge score={token.riskScore} />
        <a href={`${EXPLORER_URL}/address/${token.address}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-xs text-slate-300 transition hover:border-cyan/30 hover:text-white">Arcscan <ExternalLink className="size-3" /></a>
      </div>
    </div>

    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0"><OnchainTokenDashboard token={token} /></div>
      <aside className="h-fit xl:sticky xl:top-[100px]"><BuySellPanel token={token} /></aside>
    </div>
  </div>;
}
