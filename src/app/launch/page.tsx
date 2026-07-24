import type { Metadata } from "next";
import { LaunchForm } from "@/components/launch-form";
import { PageIntro } from "@/components/ui";
export const metadata: Metadata = { title: "Launch Token" };
export default function LaunchPage() { return <><PageIntro eyebrow="Create on Arc" title="Launch a token" body="Set the token profile, curve terms, and optional developer buy."/><div className="container-shell pb-20"><LaunchForm/></div></>; }
