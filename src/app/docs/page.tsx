import type { Metadata } from "next";
import { PageIntro, Panel, WarningBox } from "@/components/ui";

export const metadata: Metadata = { title: "Documentation" };

const sections = [
  {
    title: "Launch",
    items: [
      ["Token", "Fixed supply, no owner mint, blacklist, pause, or transfer tax."],
      ["Allocation", "The creator allocation is visible and capped at 20%."],
      ["Cost", "Launching costs 25 USDC on Arc Testnet."],
    ],
  },
  {
    title: "Trade",
    items: [
      ["Curve", "A virtual-USDC-reserve constant-product curve prices each trade."],
      ["Protection", "Quotes include minimum output so slippage is enforced onchain."],
      ["Fees", "Buys and sells each charge a visible 1% protocol fee."],
    ],
  },
  {
    title: "Verify",
    items: [
      ["Data", "Launches, trades, charts, and fees are read from Arc Testnet events."],
      ["Labels", "Demo listings and unavailable signals are explicitly identified."],
      ["Risk", "Scores organize observable signals; they never guarantee safety."],
    ],
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Product guide"
        title="How ArcOrigin works"
        body="The essentials of launching, trading, and verifying a token—without hiding protocol behavior behind marketing language."
      />
      <div className="container-shell grid gap-4 pb-20 lg:grid-cols-3">
        {sections.map((section, sectionIndex) => (
          <Panel key={section.title} className="p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-cyan/10 font-mono text-[10px] text-cyan">
                0{sectionIndex + 1}
              </span>
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
            </div>
            <div className="mt-6 divide-y divide-line">
              {section.items.map(([label, body]) => (
                <div key={label} className="py-4 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </Panel>
        ))}
        <div className="lg:col-span-3">
          <WarningBox>
            ArcOrigin is live on testnet, not audited for mainnet, and not financial advice. Legacy v1 curves stop both buys and sells at graduation; the active factory uses the hardened v2 curve.
          </WarningBox>
        </div>
      </div>
    </>
  );
}
