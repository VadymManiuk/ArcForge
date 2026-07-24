import type { Metadata } from "next";
import { CreatorDashboard } from "@/components/creator-dashboard";
import { PageIntro } from "@/components/ui";
import { shortAddress } from "@/lib/utils";

type Props = { params: Promise<{ address: string }> };
export const metadata: Metadata = { title: "Creator Profile" };

export default async function CreatorPage({ params }: Props) {
  const address = (await params).address;
  return <><PageIntro eyebrow="Creator history" title={shortAddress(address,6)} body="Wallet-linked launches confirmed by Factory events."/><CreatorDashboard address={address}/></>;
}
