import type { Metadata } from "next";
import { TrendingMarket } from "@/components/trending-market";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Trending Launches" };

export default function TrendingPage() {
  return <><PageIntro eyebrow="Momentum" title="Moving on Arc" body="Ranked by confirmed trading activity, not predicted returns."/><TrendingMarket/></>;
}
