import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import manifest from "../../../deployment/arc-testnet.json";
import { AddressPill, Badge, PageIntro, Panel, WarningBox } from "@/components/ui";
import { EXPLORER_URL } from "@/lib/chains";

export const metadata: Metadata = { title: "Deployment Status" };

const rows = [
  ["Network", "Arc Testnet"],
  ["Chain ID", String(manifest.chainId)],
  ["RPC", "https://rpc.testnet.arc.network"],
  ["Explorer", manifest.explorerBaseUrl],
  ["Deployed", new Date(manifest.deployedAt).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"],
] as const;

export default function AdminPage() {
  return <><PageIntro eyebrow="Read-only status" title="Deployment configuration" body="Public Arc Testnet deployment details without privileged controls. Contract addresses come from the committed deployment manifest."/><div className="container-shell pb-20"><Panel className="max-w-3xl p-6"><div className="flex items-center justify-between border-b border-line pb-5"><div><p className="font-semibold text-white">ArcOrigin contracts</p><p className="mt-1 text-xs text-slate-500">Committed Arc Testnet manifest · legacy ArcForge contract names</p></div><Badge tone="good">Deployed</Badge></div><dl className="mt-5 grid gap-4 text-sm">{rows.map(([label,value])=><div key={label} className="flex justify-between gap-6"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-300">{value}</dd></div>)}{Object.entries({"Fee vault":manifest.contracts.feeVault,"Creator registry":manifest.contracts.creatorRegistry,"Factory":manifest.contracts.factory,"USDC":manifest.contracts.usdc}).map(([label,address])=><div key={label} className="flex items-center justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="flex items-center gap-2"><AddressPill address={address}/><a href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" aria-label={`Open ${label} on Arcscan`} className="text-cyan"><ExternalLink className="size-3.5"/></a></dd></div>)}</dl></Panel><div className="mt-5 max-w-3xl"><WarningBox>Deployed means bytecode and configuration were verified on Arc Testnet. It is not an independent security audit or a mainnet-readiness claim.</WarningBox></div></div></>;
}
