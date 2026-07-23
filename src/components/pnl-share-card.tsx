"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, X } from "lucide-react";
import { useAccount } from "wagmi";
import type { MarketSnapshot } from "@/lib/onchain/market-snapshot";
import type { TokenData } from "@/lib/types";
import { money, shortAddress } from "@/lib/utils";
import { Button } from "./ui";

type PnlMetrics = {
  bought: number;
  sold: number;
  holdingTokens: number;
  holdingValue: number;
  pnl: number;
  pnlPercent: number;
  personal: boolean;
};

function calculateMetrics(token: TokenData, snapshot: MarketSnapshot, wallet?: string): PnlMetrics {
  const walletTrades = wallet
    ? snapshot.trades.filter((trade) => trade.wallet.toLowerCase() === wallet.toLowerCase())
    : [];
  if (wallet && walletTrades.length > 0) {
    const bought = walletTrades.filter((trade) => trade.type === "Buy").reduce((sum, trade) => sum + trade.usdc, 0);
    const sold = walletTrades.filter((trade) => trade.type === "Sell").reduce((sum, trade) => sum + trade.usdc, 0);
    const holdingTokens = Math.max(0, walletTrades.reduce(
      (sum, trade) => sum + (trade.type === "Buy" ? trade.tokens : -trade.tokens),
      0,
    ));
    const holdingValue = holdingTokens * snapshot.price;
    const pnl = sold + holdingValue - bought;
    return {
      bought,
      sold,
      holdingTokens,
      holdingValue,
      pnl,
      pnlPercent: bought > 0 ? pnl / bought * 100 : 0,
      personal: true,
    };
  }
  return {
    bought: snapshot.volume,
    sold: 0,
    holdingTokens: 0,
    holdingValue: snapshot.marketCap,
    pnl: snapshot.priceChange,
    pnlPercent: snapshot.priceChange,
    personal: false,
  };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawShareCard(token: TokenData, snapshot: MarketSnapshot, metrics: PnlMetrics, wallet?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const positive = metrics.pnlPercent >= 0;
  const accent = positive ? "#73ecc7" : "#fb7185";
  const accentRgb = positive ? "115,236,199" : "251,113,133";

  const background = context.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, "#080d0e");
  background.addColorStop(0.55, "#0b1115");
  background.addColorStop(1, "#141125");
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 630);

  const glow = context.createRadialGradient(920, 150, 30, 920, 150, 460);
  glow.addColorStop(0, `rgba(${accentRgb},.2)`);
  glow.addColorStop(1, `rgba(${accentRgb},0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 1200, 630);

  context.strokeStyle = "rgba(255,255,255,.055)";
  context.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 60) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 630);
    context.stroke();
  }
  for (let y = 0; y <= 630; y += 60) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1200, y);
    context.stroke();
  }

  context.fillStyle = "rgba(8,13,14,.78)";
  roundedRect(context, 48, 42, 1104, 546, 28);
  context.strokeStyle = "rgba(255,255,255,.10)";
  context.strokeRect(49, 43, 1102, 544);

  context.fillStyle = "#73ecc7";
  context.font = "700 24px ui-monospace, monospace";
  context.fillText("ARCORIGIN", 84, 93);
  context.fillStyle = "#84919f";
  context.font = "500 17px ui-monospace, monospace";
  context.fillText("ARC TESTNET · VERIFIED ONCHAIN", 84, 123);

  context.fillStyle = `rgba(${accentRgb},.14)`;
  roundedRect(context, 84, 162, 94, 94, 24);
  context.fillStyle = accent;
  context.font = "700 30px Inter, sans-serif";
  context.textAlign = "center";
  context.fillText(token.icon.slice(0, 3).toUpperCase(), 131, 220);
  context.textAlign = "left";

  context.fillStyle = "#f7faf9";
  context.font = "700 35px Inter, sans-serif";
  context.fillText(token.name, 202, 199);
  context.fillStyle = "#84919f";
  context.font = "500 21px ui-monospace, monospace";
  context.fillText(`${token.ticker} · ${wallet ? shortAddress(wallet) : "SINCE LAUNCH"}`, 202, 235);

  context.fillStyle = "#84919f";
  context.font = "600 16px ui-monospace, monospace";
  context.fillText(metrics.personal ? "ESTIMATED ONCHAIN PNL" : "TOKEN PERFORMANCE", 84, 326);
  context.fillStyle = accent;
  context.font = "800 86px Inter, sans-serif";
  const percent = `${positive ? "+" : ""}${metrics.pnlPercent.toFixed(2)}%`;
  context.fillText(percent, 78, 413);
  if (metrics.personal) {
    context.fillStyle = "#dfe8e5";
    context.font = "600 24px Inter, sans-serif";
    context.fillText(`${metrics.pnl >= 0 ? "+" : "−"}${money(Math.abs(metrics.pnl))}`, 84, 458);
  }

  const stats = metrics.personal
    ? [
        ["INVESTED", money(metrics.bought)],
        ["REALIZED", money(metrics.sold)],
        ["HOLDING VALUE", money(metrics.holdingValue)],
      ]
    : [
        ["PRICE", tokenPrice(snapshot.price)],
        ["MARKET CAP", money(snapshot.marketCap, true)],
        ["VOLUME", money(snapshot.volume, true)],
      ];
  stats.forEach(([label, value], index) => {
    const x = 650 + (index % 2) * 235;
    const y = 315 + Math.floor(index / 2) * 110;
    context.fillStyle = "#63717e";
    context.font = "600 14px ui-monospace, monospace";
    context.fillText(label, x, y);
    context.fillStyle = "#f4f8f7";
    context.font = "700 25px Inter, sans-serif";
    context.fillText(value, x, y + 36);
  });

  context.fillStyle = "#63717e";
  context.font = "500 15px Inter, sans-serif";
  context.fillText(metrics.personal ? "Estimate from wallet curve trades · transfers may affect actual PnL" : "Performance from launch price · not financial advice", 84, 540);
  context.textAlign = "right";
  context.fillStyle = "#73ecc7";
  context.font = "600 18px ui-monospace, monospace";
  context.fillText("arcorigin.xyz", 1110, 540);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed.")), "image/png");
  });
}

function tokenPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 0.000001) return `$${value.toFixed(10)}`;
  if (value < 0.01) return `$${value.toFixed(8)}`;
  return money(value);
}

export function PnlShareCard({ token, snapshot }: { token: TokenData; snapshot: MarketSnapshot }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const metrics = useMemo(() => calculateMetrics(token, snapshot, address), [address, snapshot, token]);
  const positive = metrics.pnlPercent >= 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function exportImage(mode: "copy" | "download") {
    setNotice("");
    try {
      const blob = await canvasBlob(drawShareCard(token, snapshot, metrics, address));
      if (mode === "copy" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setNotice("Image copied");
          return;
        } catch {
          // Browsers can deny image clipboard access; downloading still gives the user the card.
        }
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${token.ticker.toLowerCase()}-pnl.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(mode === "copy" ? "Clipboard unavailable — image downloaded" : "Image downloaded");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export the image.");
    }
  }

  return <>
    <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setOpen(true)}>
      <ImageIcon className="size-3.5" />PnL
    </Button>
    {open && <div
      role="dialog"
      aria-modal="true"
      aria-label="Share PnL"
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#020506]/80 p-3 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-[#0a1012] shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Share performance</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{metrics.personal ? "Estimated from your confirmed curve trades" : address ? "No wallet trades found — showing token performance" : "Connect a wallet for personal PnL"}</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.05] hover:text-white"><X className="size-4" /></button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="relative aspect-[1200/630] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_82%_18%,rgba(115,236,199,.15),transparent_34%),linear-gradient(135deg,#080d0e,#141125)] p-5 sm:p-7">
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between">
                <div><p className="font-mono text-[10px] font-bold tracking-[.2em] text-cyan sm:text-sm">ARCORIGIN</p><p className="mt-1 font-mono text-[7px] text-slate-500 sm:text-[9px]">ARC TESTNET · VERIFIED ONCHAIN</p></div>
                <p className="font-mono text-[8px] text-slate-500 sm:text-[10px]">{address ? shortAddress(address) : "SINCE LAUNCH"}</p>
              </div>
              <div className="mt-auto">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-cyan/10 font-mono text-xs font-semibold text-cyan sm:size-14">{token.icon}</div>
                  <div><p className="text-sm font-semibold text-white sm:text-xl">{token.name}</p><p className="font-mono text-[8px] text-slate-500 sm:text-[10px]">{token.ticker}</p></div>
                </div>
                <p className="mt-5 font-mono text-[7px] uppercase tracking-[.15em] text-slate-500 sm:text-[9px]">{metrics.personal ? "Estimated onchain PnL" : "Token performance"}</p>
                <p className={`mt-1 text-4xl font-bold tracking-tight sm:text-6xl ${positive ? "text-emerald-300" : "text-rose-300"}`}>{positive ? "+" : ""}{metrics.pnlPercent.toFixed(2)}%</p>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
                  {(metrics.personal ? [
                    ["Invested", money(metrics.bought)],
                    ["Realized", money(metrics.sold)],
                    ["Holding value", money(metrics.holdingValue)],
                  ] : [
                    ["Price", tokenPrice(snapshot.price)],
                    ["Market cap", money(snapshot.marketCap, true)],
                    ["Volume", money(snapshot.volume, true)],
                  ]).map(([label, value]) => <div key={label}><p className="font-mono text-[6px] uppercase text-slate-600 sm:text-[8px]">{label}</p><p className="mt-1 truncate text-[9px] font-semibold text-white sm:text-sm">{value}</p></div>)}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">{metrics.personal ? "PnL is estimated from this wallet’s curve trades. Token transfers are not treated as buys or sells." : "This card shows performance from the onchain launch price, not personal profit."}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void exportImage("copy")}><Copy className="size-4" />Copy image</Button>
            <Button variant="secondary" onClick={() => void exportImage("download")}><Download className="size-4" />Download PNG</Button>
            {notice && <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300"><Check className="size-3.5" />{notice}</span>}
          </div>
        </div>
      </div>
    </div>}
  </>;
}
