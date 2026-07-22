"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, ChevronRight, ExternalLink, Rocket } from "lucide-react";
import { decodeEventLog, formatUnits, publicActions, type Address, type Hash } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { ARC_TESTNET_CONTRACTS, EXPLORER_URL, arcTestnet } from "@/lib/chains";
import { erc20Abi, factoryAbi } from "@/lib/contracts";
import { shortAddress } from "@/lib/utils";
import { Button, Progress, WarningBox } from "./ui";

type FormData = {
  name: string;
  ticker: string;
  description: string;
  image: string;
  website: string;
  x: string;
  telegram: string;
  allocation: string;
  metadata: string;
};

type TransactionStatus = "idle" | "checking" | "approving" | "launching";
type LaunchResult = { token: Address; curve: Address; hash: Hash };

const defaults: FormData = {
  name: "",
  ticker: "",
  description: "",
  image: "",
  website: "",
  x: "",
  telegram: "",
  allocation: "5",
  metadata: "",
};
const confirmations = [
  "Fixed supply",
  "No hidden mint",
  "No blacklist",
  "Transparent fees",
  "Risk understood",
  "Not financial advice",
];
const LAUNCH_FEE = 25n * 10n ** 6n;
const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
const VIRTUAL_USDC_RESERVE = 10_000n * 10n ** 6n;
const GRADUATION_THRESHOLD = 50_000n * 10n ** 6n;

function transactionError(error: unknown) {
  const fallback = error instanceof Error ? error.message : "The wallet transaction failed.";
  if (/RPC Request failed|HTTP request failed|fetch failed|Too Many Requests|\b429\b/i.test(fallback)) {
    return "Arc RPC is temporarily unavailable. No transaction was sent and no USDC was charged. Please retry.";
  }
  if (typeof error === "object" && error && "shortMessage" in error) {
    return String(error.shortMessage);
  }
  return fallback;
}

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

export function LaunchForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaults);
  const [checks, setChecks] = useState<string[]>([]);
  const [status, setStatus] = useState<TransactionStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LaunchResult | null>(null);
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const update = (key: keyof FormData, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const canContinue = useMemo(
    () =>
      step === 1
        ? form.name.trim().length >= 2 &&
          form.name.trim().length <= 64 &&
          /^[A-Za-z0-9]{2,10}$/.test(form.ticker) &&
          form.description.trim().length >= 12 &&
          form.description.trim().length <= 500
        : step === 2
          ? Number(form.allocation) >= 0 && Number(form.allocation) <= 20
          : checks.length === confirmations.length,
    [step, form, checks],
  );
  const isPending = status !== "idle";

  async function launch() {
    if (!isConnected || !address) {
      setError("Connect your wallet in the header before launching a token.");
      return;
    }
    if (!publicClient && !walletClient) {
      setError("Arc Testnet RPC is unavailable. Try again in a moment.");
      return;
    }

    setError("");
    setStatus("checking");
    try {
      if (chainId !== arcTestnet.id) {
        await switchChainAsync({ chainId: arcTestnet.id });
        throw new Error("Arc Testnet is now selected. Click Launch on Arc Testnet again.");
      }

      const transactionClient = walletClient?.extend(publicActions) ?? publicClient;
      if (!transactionClient) throw new Error("No Arc Testnet client is available.");

      const balance = await withRpcRetry(() => transactionClient.readContract({
        address: ARC_TESTNET_CONTRACTS.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }));
      if (balance < LAUNCH_FEE) {
        throw new Error(
          `You have ${formatUnits(balance, 6)} USDC, but the launch fee is 25 USDC. Add testnet USDC and retry.`,
        );
      }

      const allowance = await withRpcRetry(() => transactionClient.readContract({
        address: ARC_TESTNET_CONTRACTS.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, ARC_TESTNET_CONTRACTS.factory],
      }));
      if (allowance < LAUNCH_FEE) {
        setStatus("approving");
        const approvalHash = await writeContractAsync({
          address: ARC_TESTNET_CONTRACTS.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [ARC_TESTNET_CONTRACTS.factory, LAUNCH_FEE],
        });
        const approvalReceipt = await withRpcRetry(() => transactionClient.waitForTransactionReceipt({
          hash: approvalHash,
        }));
        if (approvalReceipt.status !== "success") {
          throw new Error("USDC approval reverted onchain.");
        }
      }

      setStatus("launching");
      const launchHash = await writeContractAsync({
        address: ARC_TESTNET_CONTRACTS.factory,
        abi: factoryAbi,
        functionName: "launchToken",
        args: [{
          name: form.name.trim(),
          symbol: form.ticker.toUpperCase(),
          metadataURI: form.metadata.trim(),
          totalSupply: TOTAL_SUPPLY,
          creatorAllocationBps: Math.round(Number(form.allocation) * 100),
          virtualUsdcReserve: VIRTUAL_USDC_RESERVE,
          graduationThreshold: GRADUATION_THRESHOLD,
        }],
      });
      const receipt = await withRpcRetry(() => transactionClient.waitForTransactionReceipt({ hash: launchHash }));
      if (receipt.status !== "success") {
        throw new Error("Token launch reverted onchain.");
      }

      let launched: LaunchResult | null = null;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: factoryAbi,
            eventName: "TokenLaunched",
            data: log.data,
            topics: log.topics,
          });
          launched = {
            token: event.args.token,
            curve: event.args.curve,
            hash: launchHash,
          };
          break;
        } catch {
          // The receipt includes constructor and registry logs from other contracts.
        }
      }
      if (!launched) {
        throw new Error("The launch succeeded, but its TokenLaunched event was not found.");
      }
      setResult(launched);
    } catch (launchError) {
      setError(transactionError(launchError));
    } finally {
      setStatus("idle");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }
    if (canContinue && !isPending) void launch();
  }

  if (result) {
    return (
      <div className="panel mx-auto max-w-2xl p-8 text-center md:p-10">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-cyan/10 text-cyan">
          <Rocket />
        </div>
        <p className="eyebrow mt-6">Onchain launch confirmed</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          {form.name} · {form.ticker.toUpperCase()}
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">
          The fixed-supply token and its USDC bonding curve are deployed on Arc Testnet.
        </p>
        <dl className="mx-auto mt-6 grid max-w-lg gap-3 rounded-xl border border-line bg-black/25 p-4 text-left text-xs">
          <ResultRow label="Token" address={result.token} />
          <ResultRow label="Bonding curve" address={result.curve} />
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">Transaction</dt>
            <dd><ExplorerLink path={`tx/${result.hash}`} label={shortAddress(result.hash)} /></dd>
          </div>
        </dl>
        <Button
          className="mt-6"
          onClick={() => {
            setResult(null);
            setChecks([]);
            setForm(defaults);
            setStep(1);
          }}
        >
          Create another
        </Button>
      </div>
    );
  }

  const actionLabel =
    status === "checking"
      ? "Checking balance…"
      : status === "approving"
        ? "Approving 25 USDC…"
        : status === "launching"
          ? "Launching on Arc…"
          : step === 3
            ? "Launch on Arc Testnet"
            : "Continue";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="panel p-5 md:p-7">
        <div className="mb-7 flex items-center gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex flex-1 items-center gap-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs ${step >= item ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-line text-slate-600"}`}>
                {step > item ? <Check className="size-4" /> : item}
              </span>
              {item < 3 && <div className="h-px flex-1 bg-line" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-5">
            <div><p className="eyebrow">01 · Identity</p><h2 className="mt-2 text-xl font-semibold">Define the launch</h2></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Token name" required value={form.name} onChange={(value) => update("name", value)} placeholder="Forge Network" maxLength={64} />
              <Field label="Ticker" required value={form.ticker} onChange={(value) => update("ticker", value.toUpperCase())} placeholder="FORGE" maxLength={10} />
            </div>
            <label>
              <span className="label">Description *</span>
              <textarea className="input min-h-28 resize-none py-3" maxLength={500} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Explain the token, creator intent, and community…" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Image URL" value={form.image} onChange={(value) => update("image", value)} placeholder="https://…" />
              <Field label="Metadata URI" value={form.metadata} onChange={(value) => update("metadata", value)} placeholder="ipfs://…" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Website" value={form.website} onChange={(value) => update("website", value)} placeholder="https://…" />
              <Field label="X / Twitter" value={form.x} onChange={(value) => update("x", value)} placeholder="https://x.com/…" />
              <Field label="Telegram" value={form.telegram} onChange={(value) => update("telegram", value)} placeholder="https://t.me/…" />
            </div>
            <p className="text-[11px] leading-5 text-slate-500">The contract stores the metadata URI. Description, image, and social fields are launch-preview data until an indexer or metadata upload service is connected.</p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <div><p className="eyebrow">02 · Economics</p><h2 className="mt-2 text-xl font-semibold">Configure transparent terms</h2></div>
            <Field label="Creator allocation %" value={form.allocation} onChange={(value) => update("allocation", value)} type="number" min="0" max="20" step="0.01" />
            <div className="rounded-xl border border-line bg-black/20 p-4">
              <p className="label">Creator wallet</p>
              <p className="font-mono text-xs text-slate-300">{address ?? "Connect a wallet in the header"}</p>
              <p className="mt-2 text-[11px] text-slate-500">The factory always assigns creator ownership to the wallet that signs the launch.</p>
            </div>
            <WarningBox>The contract enforces a maximum 20% creator allocation. Supply is fixed at deployment and the remaining tokens fund the curve.</WarningBox>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <div><p className="eyebrow">03 · Verify</p><h2 className="mt-2 text-xl font-semibold">Confirm launch conditions</h2></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {confirmations.map((item) => (
                <label key={item} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white/[.018] p-3 text-sm text-slate-300">
                  <input type="checkbox" className="accent-cyan" checked={checks.includes(item)} onChange={() => setChecks((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />
                  {item}
                </label>
              ))}
            </div>
            <WarningBox>Launching requires 25 testnet USDC. Your wallet may ask for an ERC-20 approval first, followed by the factory launch transaction.</WarningBox>
          </div>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[.07] p-3 text-xs leading-5 text-rose-200">{error}</p>}
        <div className="mt-8 flex justify-between border-t border-line pt-5">
          {step > 1 ? <Button type="button" variant="ghost" disabled={isPending} onClick={() => setStep((current) => current - 1)}>Back</Button> : <span />}
          <Button type="submit" disabled={!canContinue || isPending}>
            {actionLabel}{!isPending && <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>

      <aside className="panel h-fit p-5 lg:sticky lg:top-24">
        <p className="eyebrow">Launch preview</p>
        <div className="mt-5 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-cyan/25 to-violet/25 font-mono text-xs">{form.ticker.slice(0, 2) || "??"}</div>
          <div><p className="font-semibold text-white">{form.name || "Untitled token"}</p><p className="font-mono text-xs text-slate-500">{form.ticker || "TICKER"}</p></div>
        </div>
        <dl className="mt-6 grid gap-3 text-xs">
          <Row label="Supply" value="1,000,000,000" />
          <Row label="Creator allocation" value={`${form.allocation || 0}%`} />
          <Row label="Curve target" value="50,000 USDC" />
          <Row label="Launch fee" value="25 USDC" />
          <Row label="Buy / sell fee" value="1% / 1%" />
          <Row label="Network" value="Arc Testnet" />
          <Row label="Factory" value={shortAddress(ARC_TESTNET_CONTRACTS.factory)} />
        </dl>
        <div className="mt-5"><Progress value={step * 33.33} /></div>
        <p className="mt-2 text-[10px] text-slate-600">Step {step} of 3 · onchain launch</p>
      </aside>
    </form>
  );
}

function ExplorerLink({ path, label }: { path: string; label: string }) {
  return <a href={`${EXPLORER_URL}/${path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">{label}<ExternalLink className="size-3" /></a>;
}

function ResultRow({ label, address }: { label: string; address: Address }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd><ExplorerLink path={`address/${address}`} label={shortAddress(address)} /></dd></div>;
}

function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label><span className="label">{label}{props.required && " *"}</span><input className="input" value={value} onChange={(event) => onChange(event.target.value)} {...props} /></label>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd className="text-slate-200">{value}</dd></div>;
}
