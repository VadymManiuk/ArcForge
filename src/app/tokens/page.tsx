import type { Metadata } from "next";
import { TokenScreener } from "@/components/token-screener";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { return <><PageIntro eyebrow="ArcForge screener" title="Discover the Arc market" body="Compare live launches by momentum, curve progress, creator history, and risk signals. AFG reads Arc Testnet directly; demo listings remain labeled simulated data."/><TokenScreener/></>; }
