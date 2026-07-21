import type { Metadata } from "next";
import { LaunchForm } from "@/components/launch-form";
import { PageIntro } from "@/components/ui";
export const metadata: Metadata = { title: "Launch Token" };
export default function LaunchPage() { return <><PageIntro eyebrow="Create on Arc" title="Launch with visible rules" body="Configure a fixed-supply token and USDC bonding curve. Every fee, allocation, and risk condition is shown before submission."/><div className="container-shell pb-20"><LaunchForm/></div></>; }
