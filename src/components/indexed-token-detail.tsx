"use client";

import Link from "next/link";
import { AtSign, ExternalLink, Globe, ShieldCheck } from "lucide-react";
import { BuySellPanel } from "@/components/buy-sell-panel";
import { OnchainTokenDashboard } from "@/components/onchain-token-dashboard";
import { AddressPill, Badge, Button, Panel, RiskBadge, TokenIcon, WarningBox } from "@/components/ui";
import { useFactoryTokenIndex } from "@/hooks/use-factory-token-index";
import { EXPLORER_URL } from "@/lib/chains";
import { shortAddress } from "@/lib/utils";

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

  return <div className="container-shell py-8">
    <div className="flex flex-col justify-between gap-5 border-b border-line pb-7 lg:flex-row lg:items-center">
      <div className="flex items-start gap-4">
        <TokenIcon label={token.icon} image={token.image} className="size-14 rounded-2xl text-sm" />
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{token.name}</h1>
            <span className="font-mono text-sm text-slate-500">{token.ticker}</span>
            <Badge tone="cyan">{token.status}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <AddressPill address={token.address} />
            <span>Creator {shortAddress(token.creator)}</span>
            <Badge tone="good">Onchain</Badge>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RiskBadge score={token.riskScore} />
        <a href={`${EXPLORER_URL}/address/${token.address}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-xs text-slate-300">Arcscan <ExternalLink className="size-3" /></a>
      </div>
    </div>

    <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-5">
        {(token.description || token.socials.website || token.socials.x) && <Panel className="p-5">
          <p className="eyebrow">About</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{token.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {token.socials.website && <SocialLink href={token.socials.website} icon={<Globe className="size-3.5" />} label="Website" />}
            {token.socials.x && <SocialLink href={token.socials.x} icon={<AtSign className="size-3.5" />} label="X / Twitter" />}
          </div>
        </Panel>}
        <OnchainTokenDashboard token={token} />
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-4"><p className="eyebrow">Risk profile</p><RiskBadge score={token.riskScore} /></div>
          <div className="mt-5 flex flex-wrap gap-2">{token.riskLabels.map((label) => <Badge key={label} tone={label.includes("high") || label.includes("missing") ? "bad" : "good"}><ShieldCheck className="mr-1 size-3" />{label.replaceAll("_", " ")}</Badge>)}</div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Risk labels describe visible signals, not a guarantee of safety.</p>
        </Panel>
      </div>
      <aside className="order-first h-fit xl:order-none xl:sticky xl:top-24"><BuySellPanel token={token} /></aside>
    </div>
  </div>;
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-white/[.025] px-3 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white">{icon}{label}<ExternalLink className="size-3 text-slate-600" /></a>;
}
