import type { Metadata } from "next";
import { LiveFeeDashboard } from "@/components/live-fee-dashboard";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = { title: "Fee Dashboard" };

export default function FeesPage() {
  return <><PageIntro eyebrow="Protocol economics" title="Fees" body="Confirmed launch, buy, sell, and withdrawal events from the Arc Testnet FeeVault. No simulated revenue."/><LiveFeeDashboard/></>;
}
