"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { cn, shortAddress } from "@/lib/utils";
import { Badge, Button } from "./ui";

const nav = [
  ["Markets", "/tokens"],
  ["Launch", "/launch"],
  ["Fees", "/fees"],
  ["Docs", "/docs"],
] as const;

function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const connector = connectors.find((item) => item.name === "Rabby") ?? connectors[0];

  if (isConnected && chainId !== arcTestnet.id) {
    return <Button variant="secondary" onClick={() => switchChain({ chainId: arcTestnet.id })}>Switch to Arc</Button>;
  }
  if (isConnected) {
    return <Button variant="secondary" onClick={() => disconnect()}><span className="size-2 rounded-full bg-emerald-400" />{shortAddress(address ?? "")}</Button>;
  }

  return <div className="flex items-center gap-2">
    <Button title={error?.message} onClick={() => connector && connect({ connector })} disabled={isPending || !connector}>
      <Wallet className="size-4" />{isPending ? "Connecting" : `Connect ${connector?.name ?? "wallet"}`}
    </Button>
    {error && <span className="hidden max-w-44 text-[10px] leading-4 text-rose-300 xl:block">{error.message.split("\n")[0]}</span>}
  </div>;
}

function NavLink({ href, label, path, onClick }: { href: string; label: string; path: string; onClick?: () => void }) {
  const active = path === href || path.startsWith(`${href}/`);
  return <Link
    href={href}
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    className={cn(
      "rounded-xl px-3.5 py-2 text-sm transition",
      active ? "bg-white/[.065] text-white" : "text-slate-400 hover:text-white",
    )}
  >{label}</Link>;
}

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return <header className="sticky top-0 z-50 border-b border-line bg-ink/90 backdrop-blur-xl">
    <div className="container-shell flex h-16 items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-xl border border-cyan/25 bg-gradient-to-br from-cyan to-[#9aa7ff] text-sm font-extrabold text-[#07110e] shadow-[0_0_24px_rgba(121,231,197,.12)]">A</span>
        <span className="text-sm font-semibold tracking-[.14em] text-white">ARCORIGIN</span>
        <Badge tone="neutral" className="hidden sm:inline-flex">Testnet</Badge>
      </Link>
      <nav className="hidden items-center gap-1 lg:flex">
        {nav.map(([label, href]) => <NavLink key={href} label={label} href={href} path={path} />)}
      </nav>
      <div className="hidden md:block"><WalletButton /></div>
      <button
        className="grid size-10 place-items-center rounded-xl border border-line text-slate-300 lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
      >{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
    </div>
    {open && <div id="mobile-navigation" className="container-shell grid gap-1 border-t border-line py-3 lg:hidden">
      {nav.map(([label, href]) => <NavLink key={href} label={label} href={href} path={path} onClick={() => setOpen(false)} />)}
      <div className="mt-2 md:hidden"><WalletButton /></div>
    </div>}
  </header>;
}
