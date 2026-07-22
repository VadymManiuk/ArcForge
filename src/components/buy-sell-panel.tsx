"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, Settings2 } from "lucide-react";
import {
  formatUnits,
  parseUnits,
  publicActions,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { ARC_TESTNET_CONTRACTS, arcTestnet } from "@/lib/chains";
import { bondingCurveAbi, erc20Abi } from "@/lib/contracts";
import type { TokenData } from "@/lib/types";
import { money, number } from "@/lib/utils";
import { ArcscanLink, Badge, Button, WarningBox } from "./ui";

type Side = "Buy" | "Sell";
type LiveQuote = { input: bigint; output: bigint; fee: bigint; minimumOutput: bigint };
type TransactionStatus = "idle" | "quoting" | "approving" | "trading";

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRpcRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|rate limit|\b429\b/i.test(message);
      if (!retryable || attempt === attempts) throw error;
      await wait(attempt * 750);
    }
  }
  throw new Error("Arc RPC request failed after retries.");
}

function transactionError(error: unknown) {
  const message = typeof error === "object" && error && "shortMessage" in error
    ? String(error.shortMessage)
    : error instanceof Error
      ? error.message
      : "The wallet transaction failed.";
  if (/RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|\b429\b/i.test(message)) {
    return "Arc RPC is temporarily unavailable. No trade was sent. Please retry.";
  }
  return message;
}

function displayUnits(value: bigint, decimals: number) {
  const parsed = Number(formatUnits(value, decimals));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: decimals === 6 ? 6 : 4 })
    : "—";
}

export function BuySellPanel({ token }: { token: TokenData }) {
  if (token.source === "onchain" && token.curveAddress) {
    return <LiveBuySellPanel token={token} curveAddress={token.curveAddress as Address} />;
  }
  return <DemoBuySellPanel token={token} />;
}

function LiveBuySellPanel({ token, curveAddress }: { token: TokenData; curveAddress: Address }) {
  const [side, setSide] = useState<Side>("Buy");
  const [amount, setAmount] = useState("1");
  const [slippage, setSlippage] = useState(1);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [status, setStatus] = useState<TransactionStatus>("idle");
  const [notice, setNotice] = useState("");
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const inputDecimals = side === "Buy" ? 6 : 18;
  const outputDecimals = side === "Buy" ? 18 : 6;
  const inputSymbol = side === "Buy" ? "USDC" : token.ticker;
  const outputSymbol = side === "Buy" ? token.ticker : "USDC";
  const isPending = status !== "idle";

  useEffect(() => {
    setQuote(null);
    setTransactionHash(null);
    setNotice("");
  }, [amount, side, slippage]);

  async function getClient() {
    if (!isConnected || !address) throw new Error("Connect Rabby before requesting an onchain quote.");
    if (chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id });
      throw new Error("Arc Testnet is now selected. Request the quote again.");
    }
    const client = walletClient?.extend(publicActions) ?? publicClient;
    if (!client) throw new Error("No Arc Testnet client is available.");
    return client;
  }

  async function requestQuote() {
    setNotice("");
    setTransactionHash(null);
    setStatus("quoting");
    try {
      const input = parseUnits(amount, inputDecimals);
      if (input <= 0n) throw new Error("Enter an amount greater than zero.");
      const client = await getClient();
      const [output, fee] = await withRpcRetry(() => client.readContract({
        address: curveAddress,
        abi: bondingCurveAbi,
        functionName: side === "Buy" ? "quoteBuy" : "quoteSell",
        args: [input],
      }));
      if (output <= 0n) throw new Error(side === "Sell" ? "The curve has insufficient USDC liquidity for this sale." : "The curve returned zero tokens.");
      const slippageBps = BigInt(Math.round(slippage * 100));
      const minimumOutput = output * (10_000n - slippageBps) / 10_000n;
      setQuote({ input, output, fee, minimumOutput });
      setNotice("Onchain quote ready. Review the output, then confirm the trade.");
    } catch (error) {
      setNotice(transactionError(error));
    } finally {
      setStatus("idle");
    }
  }

  async function submitTrade() {
    if (!quote || !address) return;
    setNotice("");
    setTransactionHash(null);
    try {
      const client = await getClient();
      const approvalToken = (side === "Buy" ? ARC_TESTNET_CONTRACTS.usdc : token.address) as Address;
      const allowance = await withRpcRetry(() => client.readContract({
        address: approvalToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, curveAddress],
      }));
      if (allowance < quote.input) {
        setStatus("approving");
        const approvalHash = await writeContractAsync({
          address: approvalToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [curveAddress, quote.input],
        });
        const approvalReceipt = await withRpcRetry(() => client.waitForTransactionReceipt({ hash: approvalHash }));
        if (approvalReceipt.status !== "success") throw new Error(`${inputSymbol} approval reverted onchain.`);
      }

      setStatus("trading");
      const tradeHash = side === "Buy"
        ? await writeContractAsync({
            address: curveAddress,
            abi: bondingCurveAbi,
            functionName: "buy",
            args: [quote.input, quote.minimumOutput],
          })
        : await writeContractAsync({
            address: curveAddress,
            abi: bondingCurveAbi,
            functionName: "sell",
            args: [quote.input, quote.minimumOutput],
          });
      const receipt = await withRpcRetry(() => client.waitForTransactionReceipt({ hash: tradeHash }));
      if (receipt.status !== "success") throw new Error(`${side} transaction reverted onchain.`);
      setTransactionHash(tradeHash);
      setNotice(`${side} confirmed on Arc Testnet.`);
      setQuote(null);
    } catch (error) {
      setNotice(transactionError(error));
    } finally {
      setStatus("idle");
    }
  }

  const actionLabel = status === "quoting"
    ? "Reading curve…"
    : status === "approving"
      ? `Approving ${inputSymbol}…`
      : status === "trading"
        ? `${side} pending…`
        : quote
          ? `${side} ${token.ticker}`
          : "Get onchain quote";

  return <div className="panel p-4"><div className="mb-3 flex items-center justify-between"><Badge tone="good">Live onchain</Badge><span className="font-mono text-[9px] text-slate-600">Arc Testnet</span></div><div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">{(["Buy", "Sell"] as const).map((item) => <button key={item} onClick={() => setSide(item)} className={`h-9 rounded-lg text-sm font-semibold transition ${side === item ? item === "Buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300" : "text-slate-500"}`}>{item}</button>)}</div><div className="mt-5 flex items-center justify-between"><label className="label mb-0">You pay</label><button onClick={() => setSlippage(slippage === 1 ? 0.5 : 1)} className="flex items-center gap-1 text-[10px] text-slate-500"><Settings2 className="size-3" />{slippage}% slippage</button></div><div className="mt-2 flex items-center rounded-xl border border-line bg-[#080c13] px-3 focus-within:border-cyan/50"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-14 min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none" /><Badge tone="neutral">{inputSymbol}</Badge></div><div className="relative my-3 flex justify-center"><span className="grid size-7 place-items-center rounded-full border border-line bg-panel text-slate-500"><ArrowDown className="size-3" /></span></div><label className="label">Expected output</label><div className="flex h-14 items-center justify-between rounded-xl border border-line bg-[#080c13] px-3"><span className="text-xl font-semibold text-white">{quote ? displayUnits(quote.output, outputDecimals) : "—"}</span><Badge tone="cyan">{outputSymbol}</Badge></div><dl className="my-5 grid gap-2 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Protocol fee</dt><dd className="text-slate-300">{quote ? `${displayUnits(quote.fee, 6)} USDC` : "1.00%"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Quote source</dt><dd className="text-emerald-300">Onchain reserves</dd></div><div className="flex justify-between"><dt className="text-slate-500">Minimum received</dt><dd className="text-slate-300">{quote ? `${displayUnits(quote.minimumOutput, outputDecimals)} ${outputSymbol}` : "—"}</dd></div></dl><Button className="w-full" disabled={isPending} onClick={() => quote ? void submitTrade() : void requestQuote()}>{actionLabel}</Button>{notice && <p className={`mt-3 rounded-lg p-2 text-[11px] leading-4 ${transactionHash ? "bg-emerald-400/[.07] text-emerald-300" : "bg-cyan/[.06] text-cyan"}`}>{notice}{transactionHash && <span className="ml-2"><ArcscanLink hash={transactionHash} label="View transaction" /></span>}</p>}<div className="mt-4"><WarningBox>Quotes and trades use the deployed AFG bonding curve. Rabby may request an exact-token approval before the trade transaction.</WarningBox></div></div>;
}

function DemoBuySellPanel({ token }: { token: TokenData }) {
  const [side, setSide] = useState<Side>("Buy");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState(1);
  const [notice, setNotice] = useState("");
  const rawAmount = Number(amount) || 0;
  const fee = rawAmount * 0.01;
  const tokenAmount = useMemo(() => side === "Buy" ? Math.max(0, rawAmount - fee) / token.price : rawAmount, [rawAmount, fee, side, token.price]);
  const output = side === "Buy" ? tokenAmount : tokenAmount * token.price * 0.99;
  const impact = Math.min(9.99, rawAmount / Math.max(token.raisedUSDC, 1) * 4.2);

  return <div className="panel p-4"><div className="mb-3"><Badge tone="neutral">Demo quote</Badge></div><div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">{(["Buy", "Sell"] as const).map((item) => <button key={item} onClick={() => setSide(item)} className={`h-9 rounded-lg text-sm font-semibold transition ${side === item ? item === "Buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300" : "text-slate-500"}`}>{item}</button>)}</div><div className="mt-5 flex items-center justify-between"><label className="label mb-0">You pay</label><button onClick={() => setSlippage(slippage === 1 ? 0.5 : 1)} className="flex items-center gap-1 text-[10px] text-slate-500"><Settings2 className="size-3" />{slippage}% slippage</button></div><div className="mt-2 flex items-center rounded-xl border border-line bg-[#080c13] px-3 focus-within:border-cyan/50"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-14 min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none" /><Badge tone="neutral">{side === "Buy" ? "USDC" : token.ticker}</Badge></div><div className="relative my-3 flex justify-center"><span className="grid size-7 place-items-center rounded-full border border-line bg-panel text-slate-500"><ArrowDown className="size-3" /></span></div><label className="label">Expected output</label><div className="flex h-14 items-center justify-between rounded-xl border border-line bg-[#080c13] px-3"><span className="text-xl font-semibold text-white">{number(output)}</span><Badge tone="cyan">{side === "Buy" ? token.ticker : "USDC"}</Badge></div><dl className="my-5 grid gap-2 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Protocol fee</dt><dd className="text-slate-300">1.00% · {money(fee)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Price impact</dt><dd className={impact > 5 ? "text-rose-300" : "text-slate-300"}>{impact.toFixed(2)}%</dd></div><div className="flex justify-between"><dt className="text-slate-500">Minimum received</dt><dd className="text-slate-300">{number(output * (1 - slippage / 100))} {side === "Buy" ? token.ticker : "USDC"}</dd></div></dl><Button className="w-full" onClick={() => setNotice(`Simulated ${side.toLowerCase()} only. Choose an Onchain token to trade.`)}>{side} {token.ticker}</Button>{notice && <p className="mt-3 rounded-lg bg-cyan/[.06] p-2 text-[11px] leading-4 text-cyan">{notice}</p>}<div className="mt-4"><WarningBox>This listing is simulated and does not submit transactions.</WarningBox></div></div>;
}
