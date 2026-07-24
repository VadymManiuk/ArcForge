import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, PageIntro, Panel, Progress, WarningBox } from "@/components/ui";

export const metadata: Metadata = { title: "Risk Methodology" };

const inputs = [
  ["Fixed supply", 15, "No callable post-deployment mint function"],
  ["Standard template", 15, "Known ArcOrigin source and deployment pattern"],
  ["No blacklist", 15, "No address-level transfer restrictions"],
  ["No hidden mint", 15, "Supply is fully created in the constructor"],
  ["Low creator allocation", 10, "Visible allocation below the 10% threshold"],
  ["Creator identity", 5, "At least one attributable creator channel"],
  ["Known bytecode", 10, "Verified contract or known deployed template"],
  ["Holder distribution", 10, "Concentration below the methodology threshold"],
  ["Creator history", 5, "Previous launch without recorded flags"],
] as const;

const tiers = [
  ["Clean", "80–100", "good", 90],
  ["Moderate", "60–79", "warn", 70],
  ["High risk", "40–59", "bad", 50],
  ["Extreme", "0–39", "bad", 25],
] as const;

export default function RiskPage() {
  return (
    <>
      <PageIntro
        eyebrow="Risk methodology"
        title="Signals, not guarantees"
        body="A 0–100 score built from visible contract, allocation, holder, and creator signals."
      />
      <div className="container-shell grid gap-5 pb-20 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <p className="text-sm font-medium text-white">Score inputs</p>
          </div>
          <div className="divide-y divide-line">
            {inputs.map(([label, points, detail]) => (
              <div key={label} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
                <span className="font-mono text-xs text-cyan">+{points}</span>
              </div>
            ))}
          </div>
        </Panel>
        <aside className="grid h-fit gap-4 lg:sticky lg:top-24">
          <Panel className="p-5">
            <p className="text-sm font-medium text-white">Score tiers</p>
            <div className="mt-5 grid gap-4">
              {tiers.map(([label, range, tone, value]) => (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between">
                    <Badge tone={tone}>{label}</Badge>
                    <span className="font-mono text-xs text-slate-500">{range}</span>
                  </div>
                  <Progress value={value} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-cyan" />
              <div>
                <p className="text-sm font-medium text-white">Useful for comparison</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">Highlights observable strengths, weaknesses, and missing information.</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3 border-t border-line pt-5">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-medium text-white">Not a safety guarantee</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">Cannot predict price, key compromise, social engineering, or every contract vulnerability.</p>
              </div>
            </div>
          </Panel>
          <WarningBox>Unknown holder concentration earns no points and prevents the top tier until transfer indexing confirms the signal.</WarningBox>
        </aside>
      </div>
    </>
  );
}
