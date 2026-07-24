import Link from "next/link";
import { ArrowRight, CircleDollarSign, LockKeyhole, ShieldCheck } from "lucide-react";
import { HomeMarket } from "@/components/home-market";
import { LinkButton, SectionHeading } from "@/components/ui";

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
    body: "Launches, trades, holders, and fees are indexed from Arc Testnet events.",
  },
] as const;

export default function Home() {
  return <>
    <section className="relative overflow-hidden border-b border-line">
      <div className="container-shell flex min-h-[590px] flex-col items-center justify-center py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-cyan/[.06] px-3 py-1.5 text-xs text-cyan">
          <span className="size-1.5 rounded-full bg-cyan" />
          Permissionless launches on Arc
        </div>
        <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.065em] text-white sm:text-6xl md:text-7xl lg:text-[86px]">
          Launch tokens with<br className="hidden sm:block" /> rules everyone can see.
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">
          Fixed-supply tokens, USDC bonding curves, clear fees, and onchain market data in one focused interface.
        </p>
        <div className="mt-9 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <LinkButton href="/launch" className="min-w-40">Launch token <ArrowRight className="size-4" /></LinkButton>
          <LinkButton href="/tokens" variant="secondary" className="min-w-40">Browse markets</LinkButton>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-x-7 gap-y-3 text-xs text-slate-500">
          <span>25 USDC launch fee</span><span className="hidden text-slate-700 sm:inline">•</span>
          <span>1% buy / sell fee</span><span className="hidden text-slate-700 sm:inline">•</span>
          <span>20% max creator allocation</span>
        </div>
      </div>
    </section>

    <section className="container-shell py-16 md:py-20">
      <SectionHeading
        eyebrow="Live on Arc Testnet"
        title="Markets"
        body="Only tokens confirmed by Arc Testnet Factory events are listed. Launches, trades, reserves, and timestamps come from onchain data."
        action={<Link href="/tokens" className="inline-flex items-center gap-2 text-sm text-cyan">View all markets <ArrowRight className="size-4" /></Link>}
      />
      <div className="mt-7"><HomeMarket /></div>
    </section>

    <section className="border-y border-line bg-white/[.012]">
      <div className="container-shell py-16 md:py-20">
        <SectionHeading eyebrow="Designed for clarity" title="Only the information that matters" />
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
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">Review every parameter before signing. The factory deploys the token and curve directly on Arc Testnet.</p>
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
