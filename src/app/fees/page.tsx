import type { Metadata } from "next";
import { LiveFeeDashboard } from "@/components/live-fee-dashboard";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Fee Dashboard" };

export default function FeesPage() {
  return <><PageIntro eyebrow="Protocol economics" title="Every fee, made visible" body="Read confirmed launch, buy, sell, and withdrawal events directly from the deployed Arc Testnet FeeVault. No simulated revenue is included."/><LiveFeeDashboard/></>;
}
