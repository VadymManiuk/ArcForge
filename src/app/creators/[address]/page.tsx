import type { Metadata } from "next";
import { CreatorDashboard } from "@/components/creator-dashboard";
import { PageIntro } from "@/components/ui";
import { shortAddress } from "@/lib/utils";

type Props = { params: Promise<{ address: string }> };
export const metadata: Metadata = { title: "Creator Profile" };

export default async function CreatorPage({ params }: Props) {
  const address = (await params).address;
  return <><PageIntro eyebrow="Creator reputation" title={shortAddress(address,6)} body="Wallet-linked launch history from Factory events. Demo profiles are shown only for explicitly simulated listings."/><CreatorDashboard address={address}/></>;
}
