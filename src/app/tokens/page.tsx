import type { Metadata } from "next";
import { TokenTable } from "@/components/token-table";
import { PageIntro, StatCard } from "@/components/ui";
import { mockTokens } from "@/lib/mock-data";
import { money, number } from "@/lib/utils";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { const totalVolume = mockTokens.reduce((sum, token) => sum + token.volume24h, 0); return <><PageIntro eyebrow="ArcForge screener" title="Discover the Arc market" body="Compare live launches by momentum, curve progress, creator history, and risk signals. Demo data is clearly separated from future indexed activity."/><div className="container-shell pb-20"><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Tracked launches" value={String(mockTokens.length)} detail="Demo listings"/><StatCard label="24h volume" value={money(totalVolume, true)} detail="Simulated market activity"/><StatCard label="Active buyers" value={number(mockTokens.reduce((s,t)=>s+t.buyers,0))}/><StatCard label="Graduated" value={String(mockTokens.filter((t)=>t.status==="Graduated").length)} detail="Curve target reached"/></div><TokenTable tokens={mockTokens}/></div></>; }
