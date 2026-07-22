import type { Metadata } from "next";
import { TokenScreener } from "@/components/token-screener";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Token Screener" };
export default function TokensPage() { return <><PageIntro eyebrow="Markets" title="Tokens on Arc" body="Follow the latest buys, discover new launches, and compare trending Arc markets. Sort every listing by the metrics that matter to you."/><TokenScreener/></>; }
