"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Settings2 } from "lucide-react";
import type { TokenData } from "@/lib/types";
import { money, number } from "@/lib/utils";
import { Badge, Button, WarningBox } from "./ui";

export function BuySellPanel({ token }: { token: TokenData }) {
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState(1);
  const [notice, setNotice] = useState("");
  const rawAmount = Number(amount) || 0;
  const fee = rawAmount * 0.01;
  const tokenAmount = useMemo(() => side === "Buy" ? Math.max(0, rawAmount - fee) / token.price : rawAmount, [rawAmount, fee, side, token.price]);
  const output = side === "Buy" ? tokenAmount : tokenAmount * token.price * 0.99;
  const impact = Math.min(9.99, rawAmount / Math.max(token.raisedUSDC, 1) * 4.2);
  function transact() { setNotice(`Simulated ${side.toLowerCase()} prepared. Connect deployed contracts to submit onchain.`); }

  return <div className="panel p-4"><div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">{(["Buy", "Sell"] as const).map((item) => <button key={item} onClick={() => setSide(item)} className={`h-9 rounded-lg text-sm font-semibold transition ${side === item ? item === "Buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300" : "text-slate-500"}`}>{item}</button>)}</div><div className="mt-5 flex items-center justify-between"><label className="label mb-0">You pay</label><button onClick={() => setSlippage(slippage === 1 ? 0.5 : 1)} className="flex items-center gap-1 text-[10px] text-slate-500"><Settings2 className="size-3"/>{slippage}% slippage</button></div><div className="mt-2 flex items-center rounded-xl border border-line bg-[#080c13] px-3 focus-within:border-cyan/50"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none"/><Badge tone="neutral">{side === "Buy" ? "USDC" : token.ticker}</Badge></div><div className="relative my-3 flex justify-center"><span className="grid size-7 place-items-center rounded-full border border-line bg-panel text-slate-500"><ArrowDown className="size-3" /></span></div><label className="label">Expected output</label><div className="flex h-14 items-center justify-between rounded-xl border border-line bg-[#080c13] px-3"><span className="text-xl font-semibold text-white">{number(output)}</span><Badge tone="cyan">{side === "Buy" ? token.ticker : "USDC"}</Badge></div><dl className="my-5 grid gap-2 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Protocol fee</dt><dd className="text-slate-300">1.00% · {money(fee)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Price impact</dt><dd className={impact > 5 ? "text-rose-300" : "text-slate-300"}>{impact.toFixed(2)}%</dd></div><div className="flex justify-between"><dt className="text-slate-500">Minimum received</dt><dd className="text-slate-300">{number(output * (1 - slippage / 100))} {side === "Buy" ? token.ticker : "USDC"}</dd></div></dl><Button className="w-full" onClick={transact}>{side} {token.ticker}</Button>{notice && <p className="mt-3 rounded-lg bg-cyan/[.06] p-2 text-[11px] leading-4 text-cyan">{notice}</p>}<div className="mt-4"><WarningBox>Token trading is risky. Quotes are simulated in demo mode and may differ from onchain execution.</WarningBox></div></div>;
}
