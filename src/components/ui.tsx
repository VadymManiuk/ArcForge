import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { EXPLORER_URL } from "@/lib/chains";
import { cn, shortAddress } from "@/lib/utils";

export function NetworkBanner() {
  return <div className="border-b border-line bg-[#0b0e0f] py-1.5 text-center text-[11px] text-slate-400"><span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400 align-middle"/>Arc Testnet · verified Factory launches and trades only</div>;
}

export function Button({ className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", variant === "primary" && "bg-cyan text-[#07110e] hover:bg-[#98efd5]", variant === "secondary" && "border border-line bg-white/[.035] text-white hover:border-slate-500 hover:bg-white/[.06]", variant === "ghost" && "text-slate-400 hover:bg-white/[.045] hover:text-white", variant === "danger" && "bg-rose-400/15 text-rose-300", className)} {...props} />;
}

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return <Link href={href} className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition", variant === "primary" ? "bg-cyan text-[#07110e] hover:bg-[#98efd5]" : "border border-line bg-white/[.025] text-white hover:border-slate-500 hover:bg-white/[.05]", className)}>{children}</Link>;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "cyan"; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.09em]", tone === "neutral" && "border-line bg-white/[.03] text-slate-400", tone === "good" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-300", tone === "warn" && "border-amber-300/20 bg-amber-300/10 text-amber-200", tone === "bad" && "border-rose-400/20 bg-rose-400/10 text-rose-300", tone === "cyan" && "border-cyan/20 bg-cyan/10 text-cyan", className)}>{children}</span>;
}

export function StatCard({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return <div className={cn("rounded-2xl border border-line bg-panel p-4 md:p-5", className)}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-.025em] text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>;
}

export function SectionHeading({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div>{eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}<h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{title}</h2>{body && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{body}</p>}</div>{action}</div>;
}

export function AddressPill({ address }: { address: string }) { return <code className="rounded-lg border border-line bg-black/20 px-2 py-1 text-[11px] text-slate-400">{shortAddress(address)}</code>; }
export function ArcscanLink({ hash, label }: { hash: string; label?: string }) { return <a href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">{label ?? shortAddress(hash)} <ExternalLink className="size-3" /></a>; }

export function WarningBox({ children }: { children: ReactNode }) { return <div className="flex gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[.05] p-3 text-xs leading-5 text-amber-100/75"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />{children}</div>; }

export function RiskBadge({ score }: { score: number }) {
  const tone = score >= 80 ? "good" : score >= 60 ? "warn" : "bad";
  return <Badge tone={tone}><ShieldCheck className="mr-1 size-3" />{score} score</Badge>;
}

export function TokenIcon({ label, image, className }: { label: string; image?: string; className?: string }) {
  return <div className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-cyan/20 bg-cyan/[.09] font-mono text-[11px] font-semibold text-cyan", className)}>
    {image ? <span role="img" aria-label={`${label} token image`} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} /> : label}
  </div>;
}

export function Progress({ value }: { value: number }) { return <div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${Math.min(100, value)}%` }} /></div>; }

export function PageIntro({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children?: ReactNode }) {
  return <div className="container-shell pb-8 pt-10 md:pb-10 md:pt-14"><div className="max-w-2xl"><p className="eyebrow mb-3">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl md:text-5xl">{title}</h1><p className="mt-4 text-sm leading-6 text-slate-400 md:text-base md:leading-7">{body}</p>{children}</div></div>;
}

export function EmptyState({ title, body }: { title: string; body: string }) { return <div className="panel p-10 text-center"><p className="font-medium text-white">{title}</p><p className="mt-2 text-sm text-slate-500">{body}</p></div>; }
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("panel", className)} {...props} />; }
