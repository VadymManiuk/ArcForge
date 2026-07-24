import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, LockKeyhole, ShieldCheck } from "lucide-react";
import { HomeMarket } from "@/components/home-market";
import { Badge, LinkButton, Progress, SectionHeading } from "@/components/ui";

const principles = [
  {
    icon: LockKeyhole,
    title: "Fixed supply",
    body: "No hidden mint, blacklist, transfer tax, or owner controls in the launch template.",
  },
  {
    icon: CircleDollarSign,
    title: "USDC pricing",
    body: "Every quote, reserve, trading fee, and graduation target is shown in USDC.",
  },
  {
    icon: ShieldCheck,
    title: "Verifiable activity",
    body: "Launches, trades, and holders are indexed from Arc Testnet events.",
  },
] as const;

export default function Home() {
  return <>
    <section className="relative overflow-hidden border-b border-line">
      <div className="pointer-events-none absolute inset-0 grid-line opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      <div className="container-shell relative grid min-h-[620px] items-center gap-12 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/[.06] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-cyan">
            <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_currentColor]" />
            Built on Arc Testnet
          </div>
          <h1 className="mt-7 text-5xl font-extrabold leading-[.98] tracking-[-.07em] text-white sm:text-6xl lg:text-[74px]">
            Launch tokens on Arc.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 md:text-lg">
            Fixed supply, USDC bonding curves, permanent liquidity, and verifiable market data.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/launch" className="min-w-40">Launch token <ArrowRight className="size-4" /></LinkButton>
            <LinkButton href="/tokens" variant="secondary" className="min-w-40">Open markets</LinkButton>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] text-slate-500">
            <span>25 USDC launch</span><span>1% trading fee</span><span>10K USDC graduation</span>
          </div>
        </div>

        <div className="panel relative overflow-hidden p-3 sm:p-5">
          <div className="absolute inset-0 grid-line opacity-40" />
          <div className="relative rounded-2xl border border-line bg-[#080d16]/95 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
              <div><p className="eyebrow">Launch console</p><h2 className="mt-2 text-xl font-bold text-white">Transparent by default</h2></div>
              <Badge tone="good">Arc Testnet</Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ConsoleStat label="Supply" value="Fixed" detail="No hidden mint" />
              <ConsoleStat label="Quote asset" value="USDC" detail="Readable pricing" />
              <ConsoleStat label="Graduation" value="10,000" detail="USDC raised" />
              <ConsoleStat label="Liquidity" value="Permanent" detail="No withdrawal" />
            </div>
            <div className="mt-5 rounded-xl border border-line bg-white/[.025] p-4">
              <div className="flex items-center justify-between gap-4 text-xs"><span className="text-slate-400">Bonding curve</span><span className="font-mono text-cyan">0 → 10K USDC</span></div>
              <div className="mt-3"><Progress value={32} /></div>
              <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-cyan" />1% buy / sell</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-cyan" />70 / 30 fee split</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="container-shell py-16 md:py-20">
      <SectionHeading
        eyebrow="Live on Arc"
        title="Markets"
        body="Factory launches and trades verified onchain."
        action={<Link href="/tokens" className="inline-flex items-center gap-2 text-sm text-cyan">View all markets <ArrowRight className="size-4" /></Link>}
      />
      <div className="mt-7"><HomeMarket /></div>
    </section>

    <section className="border-y border-line bg-white/[.012]">
      <div className="container-shell py-16 md:py-20">
        <SectionHeading eyebrow="Protocol" title="Simple, visible rules" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {principles.map(({ icon: Icon, title, body }) => <div key={title} className="rounded-2xl border border-line bg-panel p-6">
            <div className="grid size-9 place-items-center rounded-xl bg-cyan/[.08] text-cyan"><Icon className="size-4" /></div>
            <h3 className="mt-5 font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section className="container-shell py-16 md:py-20">
      <div className="rounded-3xl border border-line bg-panel px-6 py-10 text-center md:px-10 md:py-14">
        <p className="eyebrow">Create on Arc</p>
        <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-[-.04em] text-white md:text-5xl">A transparent market starts with a transparent launch.</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">Review the parameters, sign, and deploy directly on Arc Testnet.</p>
        <LinkButton href="/launch" className="mt-7">Start a launch <ArrowRight className="size-4" /></LinkButton>
      </div>
    </section>

    <footer className="border-t border-line">
      <div className="container-shell flex flex-col justify-between gap-5 py-8 text-xs text-slate-500 md:flex-row md:items-center">
        <p>© 2026 ArcOrigin · Arc Testnet · Not financial advice.</p>
        <div className="flex flex-wrap gap-5"><Link href="/docs" className="hover:text-white">Docs</Link><Link href="/risk" className="hover:text-white">Risk model</Link><Link href="/admin" className="hover:text-white">Contracts</Link></div>
      </div>
    </footer>
  </>;
}

function ConsoleStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-line bg-white/[.025] p-4"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-slate-600">{label}</p><p className="mt-2 text-lg font-bold text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>;
}
