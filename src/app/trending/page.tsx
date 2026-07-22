import type { Metadata } from "next";
import { TrendingMarket } from "@/components/trending-market";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Trending Launches" };

export default function TrendingPage() {
  return <><PageIntro eyebrow="Momentum index" title="What is moving on Arc" body="Onchain launches use confirmed Arc Testnet activity. Listings marked Demo remain simulated. Momentum measures activity—not quality or expected returns."/><TrendingMarket/></>;
}
