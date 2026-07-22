"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, keccak256, parseAbiItem, toHex, type Address, type Hash } from "viem";
import { usePublicClient } from "wagmi";
import { RevenueChart, type RevenuePoint } from "@/components/revenue-chart";
import { AddressPill, ArcscanLink, Badge, Button, Panel, StatCard, WarningBox } from "@/components/ui";
import { ARC_TESTNET_CONTRACTS, arcTestnet } from "@/lib/chains";
import { erc20Abi } from "@/lib/contracts";
import { money } from "@/lib/utils";

const FIRST_PROTOCOL_FEE_BLOCK = 53_061_367n;
const feeReceivedEvent = parseAbiItem("event FeeReceived(address indexed asset, address indexed payer, bytes32 indexed feeType, uint256 amount)");
const feeWithdrawnEvent = parseAbiItem("event FeeWithdrawn(address indexed asset, address indexed recipient, uint256 amount)");
const feeTypes = {
  [keccak256(toHex("LAUNCH_FEE"))]: "Launch",
  [keccak256(toHex("BUY_FEE"))]: "Buy",
  [keccak256(toHex("SELL_FEE"))]: "Sell",
} as const;
type FeeSource = "Launch" | "Buy" | "Sell" | "Other";
type FeeRow = {
  blockNumber: bigint;
  logIndex: number;
  source: FeeSource | "Withdrawal";
  amount: number;
  account: Address;
  transactionHash: Hash;
};
type FeeSnapshot = {
  totalCollected: number;
  vaultBalance: number;
  launchFees: number;
  buyFees: number;
  sellFees: number;
  chart: RevenuePoint[];
  rows: FeeRow[];
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRpcRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|rate limit|request limit|\b429\b/i.test(message);
      if (!retryable || attempt === attempts) throw error;
      await wait(attempt * 700);
    }
  }
  throw new Error("Arc RPC request failed after retries.");
}

function sourceFor(feeType: Hash): FeeSource {
  return feeTypes[feeType as keyof typeof feeTypes] ?? "Other";
}

function exactUsdc(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

async function loadFees(client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<FeeSnapshot> {
  const receivedLogs = await withRpcRetry(() => client.getLogs({
    address: ARC_TESTNET_CONTRACTS.feeVault,
    event: feeReceivedEvent,
    args: { asset: ARC_TESTNET_CONTRACTS.usdc },
    fromBlock: FIRST_PROTOCOL_FEE_BLOCK,
    toBlock: "latest",
  }));
  await wait(400);
  const withdrawnLogs = await withRpcRetry(() => client.getLogs({
    address: ARC_TESTNET_CONTRACTS.feeVault,
    event: feeWithdrawnEvent,
    args: { asset: ARC_TESTNET_CONTRACTS.usdc },
    fromBlock: FIRST_PROTOCOL_FEE_BLOCK,
    toBlock: "latest",
  }));
  await wait(400);
  const vaultBalanceRaw = await withRpcRetry(() => client.readContract({
    address: ARC_TESTNET_CONTRACTS.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [ARC_TESTNET_CONTRACTS.feeVault],
  }));

  const receivedRows: FeeRow[] = receivedLogs.map((log) => ({
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
    source: sourceFor(log.args.feeType as Hash),
    amount: Number(formatUnits(log.args.amount ?? 0n, 6)),
    account: log.args.payer as Address,
    transactionHash: log.transactionHash as Hash,
  }));
  const withdrawalRows: FeeRow[] = withdrawnLogs.map((log) => ({
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
    source: "Withdrawal",
    amount: Number(formatUnits(log.args.amount ?? 0n, 6)),
    account: log.args.recipient as Address,
    transactionHash: log.transactionHash as Hash,
  }));
  const ascending = receivedRows.slice().sort((left, right) => left.blockNumber === right.blockNumber
    ? left.logIndex - right.logIndex
    : left.blockNumber < right.blockNumber ? -1 : 1);
  let cumulative = 0;
  const chart: RevenuePoint[] = [{ block: "Start", revenue: 0 }, ...ascending.map((row) => {
    cumulative += row.amount;
    return { block: `#${(row.blockNumber % 100_000n).toString()}`, revenue: cumulative };
  })];
  const amountFor = (source: FeeSource) => receivedRows
    .filter((row) => row.source === source)
    .reduce((sum, row) => sum + row.amount, 0);
  const rows = [...receivedRows, ...withdrawalRows].sort((left, right) => left.blockNumber === right.blockNumber
    ? right.logIndex - left.logIndex
    : left.blockNumber > right.blockNumber ? -1 : 1);

  return {
    totalCollected: receivedRows.reduce((sum, row) => sum + row.amount, 0),
    vaultBalance: Number(formatUnits(vaultBalanceRaw, 6)),
    launchFees: amountFor("Launch"),
    buyFees: amountFor("Buy"),
    sellFees: amountFor("Sell"),
    chart,
    rows,
  };
}

export function LiveFeeDashboard() {
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadFees(client));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(/rate limit|request limit|Too Many Requests|\b429\b|RPC Request failed|HTTP request failed/i.test(message)
        ? "Arc Testnet RPC is rate-limited. No simulated revenue was substituted; retry in a moment."
        : "Live fee data could not be loaded from Arc Testnet.");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    const handleTrade = () => void refresh();
    window.addEventListener("arcforge:trade-confirmed", handleTrade);
    return () => window.removeEventListener("arcforge:trade-confirmed", handleTrade);
  }, [refresh]);

  if (!snapshot) return <div className="container-shell pb-20"><Panel className="p-5"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Onchain fee accounting</p><p className="mt-2 text-sm text-slate-400">{loading ? "Reading FeeVault events and USDC balance…" : "Live data unavailable"}</p></div>{!loading && <Button variant="ghost" onClick={() => void refresh()}>Retry</Button>}</div>{error && <WarningBox>{error}</WarningBox>}</Panel></div>;

  return <div className="container-shell pb-20">
    <div className="mb-3 flex justify-end"><Badge tone={loading ? "neutral" : "good"}>{loading ? "Updating…" : "Live FeeVault"}</Badge></div>
    {error && <div className="mb-5"><WarningBox>{error}</WarningBox></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard label="Total collected" value={exactUsdc(snapshot.totalCollected)} detail="FeeReceived events"/>
      <StatCard label="Vault balance" value={exactUsdc(snapshot.vaultBalance)} detail="Current USDC balance"/>
      <StatCard label="Launch fees" value={money(snapshot.launchFees)} detail="25 USDC / launch"/>
      <StatCard label="Buy fees" value={money(snapshot.buyFees)} detail="1.00% of input"/>
      <StatCard label="Sell fees" value={money(snapshot.sellFees)} detail="1.00% of gross output"/>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
      <Panel className="p-5"><div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Cumulative fees</p><h2 className="mt-2 text-lg font-semibold">Confirmed FeeReceived events</h2></div><Button variant="ghost" disabled={loading} onClick={() => void refresh()}>Refresh</Button></div><RevenueChart data={snapshot.chart}/></Panel>
      <Panel className="p-5"><p className="eyebrow">Fee model</p><dl className="mt-5 grid gap-4 text-sm">{[["Launch fee", "25 USDC", "On token creation"], ["Buy fee", "1.00%", "Of USDC input"], ["Sell fee", "1.00%", "Of gross USDC output"], ["Migration fee", "Not enabled", "No migration charge is collected"], ["Creator verification", "Disabled", "MVP"]].map(([label, value, note]) => <div key={label} className="border-b border-line pb-3 last:border-0"><div className="flex justify-between"><dt className="text-slate-400">{label}</dt><dd className="font-medium text-white">{value}</dd></div><p className="mt-1 text-[10px] text-slate-600">{note}</p></div>)}</dl><div className="mt-5 rounded-xl border border-line bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-600">Fee vault</p><div className="mt-2 flex items-center justify-between"><AddressPill address={ARC_TESTNET_CONTRACTS.feeVault}/><Badge tone="good">Deployed</Badge></div></div></Panel>
    </div>
    <Panel className="mt-5 overflow-hidden"><div className="border-b border-line p-5"><p className="eyebrow">FeeVault activity</p><h2 className="mt-2 text-lg font-semibold">Confirmed fee events</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs [&_td]:px-4 [&_th]:px-4"><thead><tr className="border-b border-line font-mono text-[9px] uppercase tracking-wider text-slate-600"><th className="py-3">Block</th><th>Source</th><th>Amount</th><th>Payer / recipient</th><th>Transaction</th><th>Status</th></tr></thead><tbody>{snapshot.rows.map((row) => <tr key={`${row.transactionHash}-${row.logIndex}`} className="border-b border-line/60 last:border-0"><td className="py-3 text-slate-500">{row.blockNumber.toString()}</td><td><Badge tone={row.source === "Launch" ? "cyan" : row.source === "Buy" ? "good" : row.source === "Sell" ? "bad" : "neutral"}>{row.source}</Badge></td><td className={row.source === "Withdrawal" ? "text-rose-300" : "text-slate-300"}>{row.source === "Withdrawal" ? "−" : ""}{money(row.amount)}</td><td><AddressPill address={row.account}/></td><td><ArcscanLink hash={row.transactionHash}/></td><td><Badge tone="good">Onchain</Badge></td></tr>)}{snapshot.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No FeeReceived or FeeWithdrawn events found.</td></tr>}</tbody></table></div></Panel>
  </div>;
}
