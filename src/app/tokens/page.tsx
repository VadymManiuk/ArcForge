import type { Metadata } from "next";
import { TokenScreener } from "@/components/token-screener";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { return <><PageIntro eyebrow="Markets" title="Tokens on Arc" body="Compare Factory launches and confirmed Arc Testnet activity."/><TokenScreener/></>; }
