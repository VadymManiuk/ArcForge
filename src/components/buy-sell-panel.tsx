"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Settings2 } from "lucide-react";
import {
  formatUnits,
  parseUnits,
  publicActions,
  type Address,
  type Hash,
  type PublicClient,
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
type TransactionStatus = "idle" | "quoting" | "preparing" | "approving" | "trading";
type WalletBalances = { usdc: bigint; token: bigint };
const percentageOptions = [10, 25, 50, 75, 100] as const;

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
    return "Arc RPC is temporarily unavailable. Check Rabby activity or Arcscan before retrying because the transaction may already have been submitted.";
  }
  return message;
}

function displayUnits(value: bigint, decimals: number) {
  const parsed = Number(formatUnits(value, decimals));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: decimals === 6 ? 6 : 4 })
    : "—";
}

function inputUnits(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals);
  const trimmed = formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
  return trimmed || "0";
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
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const submissionLockRef = useRef(false);
  const balanceRequestRef = useRef(0);
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
  const tradingDisabled = token.status === "Graduated";
  const activeBalance = side === "Buy" ? balances?.usdc : balances?.token;

  const refreshBalances = useCallback(async () => {
    const requestId = ++balanceRequestRef.current;
    if (!address || chainId !== arcTestnet.id) {
      setBalances(null);
      setBalanceLoading(false);
      setBalanceError(false);
      return;
    }
    const account = address;
    const walletReadClient = walletClient?.chain.id === arcTestnet.id
      ? walletClient.extend(publicActions) as unknown as PublicClient
      : null;
    const clients = [walletReadClient, publicClient].filter((client): client is PublicClient => Boolean(client));
    if (clients.length === 0) return;
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      async function readBalance(contractAddress: Address) {
        let lastError: unknown;
        for (const client of clients) {
          try {
            return await withRpcRetry(() => client.readContract({
              address: contractAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }), 2);
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError ?? new Error("No Arc Testnet balance client is available.");
      }
      const usdc = await readBalance(ARC_TESTNET_CONTRACTS.usdc);
      await wait(180);
      const tokenBalance = await readBalance(token.address as Address);
      if (balanceRequestRef.current === requestId) setBalances({ usdc, token: tokenBalance });
    } catch {
      if (balanceRequestRef.current === requestId) {
        setBalances(null);
        setBalanceError(true);
      }
    } finally {
      if (balanceRequestRef.current === requestId) setBalanceLoading(false);
    }
  }, [address, chainId, publicClient, token.address, walletClient]);

  useEffect(() => {
    setQuote(null);
    setTransactionHash(null);
    setNotice("");
  }, [amount, side, slippage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshBalances(), 1_500);
    return () => window.clearTimeout(timeout);
  }, [refreshBalances]);

  useEffect(() => {
    if (!balanceError) return;
    const timeout = window.setTimeout(() => void refreshBalances(), 12_000);
    return () => window.clearTimeout(timeout);
  }, [balanceError, refreshBalances]);

  function selectBalancePercent(percent: (typeof percentageOptions)[number]) {
    if (activeBalance === undefined) return;
    const selected = activeBalance * BigInt(percent) / 100n;
    setAmount(inputUnits(selected, inputDecimals));
  }

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
      if (tradingDisabled) throw new Error("Trading is closed on this deployed curve after graduation. Migration is not enabled.");
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
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    setStatus("preparing");
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
      setTransactionHash(tradeHash);
      const receipt = await withRpcRetry(() => client.waitForTransactionReceipt({ hash: tradeHash }));
      if (receipt.status !== "success") throw new Error(`${side} transaction reverted onchain.`);
      setTransactionHash(tradeHash);
      setNotice(`${side} confirmed on Arc Testnet.`);
      setQuote(null);
      await refreshBalances();
      window.dispatchEvent(new CustomEvent("arcforge:trade-confirmed", {
        detail: { tokenAddress: token.address, transactionHash: tradeHash },
      }));
    } catch (error) {
      setNotice(transactionError(error));
    } finally {
      submissionLockRef.current = false;
      setStatus("idle");
    }
  }

  const actionLabel = status === "quoting"
    ? "Reading curve…"
    : status === "preparing"
      ? "Preparing transaction…"
      : status === "approving"
        ? `Approving ${inputSymbol}…`
        : status === "trading"
          ? `${side} pending…`
          : tradingDisabled
            ? "Trading closed at graduation"
            : quote
              ? `${side} ${token.ticker}`
              : "Get onchain quote";

  const balanceLabel = !address
    ? "Connect wallet"
    : chainId !== arcTestnet.id
      ? "Switch to Arc Testnet"
      : balanceLoading
        ? "Reading balance…"
        : activeBalance === undefined
          ? balanceError ? "Balance unavailable · Retry" : "Balance unavailable"
          : `Balance ${displayUnits(activeBalance, inputDecimals)} ${inputSymbol}`;

  return <div className="panel p-4">
    <div className="mb-3 flex items-center justify-between"><Badge tone="good">Live onchain</Badge><span className="font-mono text-[9px] text-slate-600">Arc Testnet</span></div>
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">{(["Buy", "Sell"] as const).map((item) => <button key={item} disabled={isPending} onClick={() => setSide(item)} className={`h-9 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${side === item ? item === "Buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300" : "text-slate-500"}`}>{item}</button>)}</div>
    <div className="mt-5 flex items-center justify-between gap-3"><label className="label mb-0">You pay</label><div className="flex items-center gap-3"><button type="button" disabled={!balanceError || balanceLoading} onClick={() => void refreshBalances()} className={`max-w-[170px] truncate text-[10px] disabled:cursor-default ${balanceError ? "text-cyan" : "text-slate-500"}`} title={balanceLabel}>{balanceLabel}</button><button disabled={isPending} onClick={() => setSlippage(slippage === 1 ? 0.5 : 1)} className="flex items-center gap-1 text-[10px] text-slate-500 disabled:opacity-50"><Settings2 className="size-3" />{slippage}%</button></div></div>
    <div className="mt-2 flex items-center rounded-xl border border-line bg-[#080c13] px-3 focus-within:border-cyan/50"><input inputMode="decimal" value={amount} disabled={isPending} onChange={(event) => setAmount(event.target.value)} className="h-14 min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none disabled:opacity-50" /><Badge tone="neutral">{inputSymbol}</Badge></div>
    <div className="mt-2 grid grid-cols-5 gap-1">{percentageOptions.map((percent) => <button key={percent} type="button" disabled={isPending || activeBalance === undefined || activeBalance === 0n} onClick={() => selectBalancePercent(percent)} className="h-8 rounded-lg border border-line bg-black/15 font-mono text-[10px] text-slate-400 transition hover:border-cyan/35 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-35">{percent}%</button>)}</div>
    <div className="relative my-3 flex justify-center"><span className="grid size-7 place-items-center rounded-full border border-line bg-panel text-slate-500"><ArrowDown className="size-3" /></span></div>
    <label className="label">Expected output</label>
    <div className="flex h-14 items-center justify-between rounded-xl border border-line bg-[#080c13] px-3"><span className="text-xl font-semibold text-white">{quote ? displayUnits(quote.output, outputDecimals) : "—"}</span><Badge tone="cyan">{outputSymbol}</Badge></div>
    <dl className="my-5 grid gap-2 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Protocol fee</dt><dd className="text-slate-300">{quote ? `${displayUnits(quote.fee, 6)} USDC` : "1.00%"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Quote source</dt><dd className="text-emerald-300">Onchain reserves</dd></div><div className="flex justify-between"><dt className="text-slate-500">Minimum received</dt><dd className="text-slate-300">{quote ? `${displayUnits(quote.minimumOutput, outputDecimals)} ${outputSymbol}` : "—"}</dd></div></dl>
    <Button className="w-full" disabled={isPending || tradingDisabled} onClick={() => quote ? void submitTrade() : void requestQuote()}>{actionLabel}</Button>
    {notice && <p className={`mt-3 rounded-lg p-2 text-[11px] leading-4 ${transactionHash ? "bg-emerald-400/[.07] text-emerald-300" : "bg-cyan/[.06] text-cyan"}`}>{notice}{transactionHash && <span className="ml-2"><ArcscanLink hash={transactionHash} label="View transaction" /></span>}</p>}
    <div className="mt-4"><WarningBox>{tradingDisabled ? "This deployed curve closes trading at graduation; migration is not enabled." : `Quotes and trades use the deployed ${token.ticker} bonding curve. Rabby may request an exact-token approval before the trade transaction.`}</WarningBox></div>
  </div>;
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
