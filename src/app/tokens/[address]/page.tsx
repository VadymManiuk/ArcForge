import type { Metadata } from "next";
import { IndexedTokenDetail } from "@/components/indexed-token-detail";

type Props = { params: Promise<{ address: string }> };

export const metadata: Metadata = { title: "Onchain Token" };

export default async function TokenDetailPage({ params }: Props) {
  return <IndexedTokenDetail address={(await params).address}/>;
}
