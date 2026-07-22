import type { Metadata } from "next";
import { TokenScreener } from "@/components/token-screener";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { return <><PageIntro eyebrow="ArcForge screener" title="Discover the Arc market" body="Factory launches and their market activity are indexed directly from Arc Testnet. Demo listings remain clearly labeled simulated data."/><TokenScreener/></>; }
