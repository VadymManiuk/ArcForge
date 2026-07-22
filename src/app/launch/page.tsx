import type { Metadata } from "next";
import { LaunchForm } from "@/components/launch-form";
import { PageIntro } from "@/components/ui";
export const metadata: Metadata = { title: "Launch Token" };
export default function LaunchPage() { return <><PageIntro eyebrow="Create on Arc" title="Launch a token" body="Configure a fixed supply and USDC bonding curve. You will review every fee and allocation before signing."/><div className="container-shell pb-20"><LaunchForm/></div></>; }
