import type { Metadata } from "next";
import { TokenScreener } from "@/components/token-screener";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { return <><PageIntro eyebrow="Markets" title="Tokens on Arc" body="Browse confirmed factory launches and trade directly against their USDC bonding curves. Demo listings are available in a separate filter."/><TokenScreener/></>; }
