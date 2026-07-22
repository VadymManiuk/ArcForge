"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Menu, Wallet } from "lucide-react";
import { useState } from "react";
import { arcTestnet } from "@/lib/chains";
import { cn, shortAddress } from "@/lib/utils";
import { Badge, Button } from "./ui";

const nav = [["Tokens", "/tokens"], ["Trending", "/trending"], ["Launch", "/launch"], ["Fees", "/fees"], ["Risk", "/risk"], ["Docs", "/docs"]];

function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const connector = connectors.find((item) => item.name === "Rabby") ?? connectors[0];
  if (isConnected && chainId !== arcTestnet.id) return <Button variant="secondary" onClick={() => switchChain({ chainId: arcTestnet.id })}>Switch to Arc</Button>;
  if (isConnected) return <Button variant="secondary" onClick={() => disconnect()}><span className="size-2 rounded-full bg-emerald-400" />{shortAddress(address ?? "")}</Button>;
  return <div className="flex items-center gap-2"><Button title={error?.message} onClick={() => connector && connect({ connector })} disabled={isPending || !connector}><Wallet className="size-4" />{isPending ? "Connecting" : `Connect ${connector?.name ?? "wallet"}`}</Button>{error && <span className="hidden max-w-44 text-[10px] leading-4 text-rose-300 xl:block">{error.message.split("\n")[0]}</span>}</div>;
}

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-50 border-b border-line/80 bg-ink/75 backdrop-blur-2xl"><div className="container-shell flex h-16 items-center justify-between"><Link href="/" className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg border border-cyan/30 bg-cyan/10 text-cyan">A</span><span className="text-sm font-semibold tracking-[.18em] text-white">ARCORIGIN</span><Badge tone="cyan" className="hidden sm:inline-flex">Testnet</Badge></Link><nav className="hidden items-center gap-1 lg:flex">{nav.map(([label, href]) => <Link key={href} href={href} className={cn("rounded-lg px-3 py-2 text-xs font-medium transition", path === href ? "bg-white/[.06] text-white" : "text-slate-400 hover:text-white")}>{label}</Link>)}</nav><div className="hidden md:block"><WalletButton /></div><button className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation"><Menu /></button></div>{open && <div className="container-shell grid gap-1 border-t border-line py-3 lg:hidden">{nav.map(([label, href]) => <Link onClick={() => setOpen(false)} key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/[.04]">{label}</Link>)}<div className="mt-2 md:hidden"><WalletButton /></div></div>}</header>;
}
