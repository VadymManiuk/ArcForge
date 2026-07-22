"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartPoint } from "@/lib/types";
import { money } from "@/lib/utils";
import { Button } from "./ui";

const ranges = ["5m", "1h", "6h", "24h", "All"] as const;
type ChartRange = (typeof ranges)[number];

const intervalSeconds: Record<ChartRange, number> = {
  "5m": 15,
  "1h": 60,
  "6h": 300,
  "24h": 900,
  All: 3600,
};

const rangeSeconds: Record<Exclude<ChartRange, "All">, number> = {
  "5m": 5 * 60,
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
};

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function tokenPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (value < 0.000001) return `$${value.toFixed(10)}`;
  if (value < 0.01) return `$${value.toFixed(8)}`;
  return money(value);
}

function buildCandles(data: ChartPoint[], range: ChartRange): Candle[] {
  if (data.length === 0) return [];
  const fallbackStart = 1_700_000_000;
  const ticks = data.map((point, index) => ({
    price: point.price,
    volume: point.volume,
    timestamp: point.timestamp ?? fallbackStart + index * 60,
  })).filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (ticks.length === 0) return [];

  const latestTimestamp = ticks.at(-1)?.timestamp ?? fallbackStart;
  const visibleTicks = range === "All"
    ? ticks
    : ticks.filter((tick) => tick.timestamp >= latestTimestamp - rangeSeconds[range]);
  const source = visibleTicks.length > 0 ? visibleTicks : [ticks[ticks.length - 1]];
  const bucketSize = intervalSeconds[range];
  const buckets = new Map<number, Candle>();

  for (const tick of source) {
    const bucket = Math.floor(tick.timestamp / bucketSize) * bucketSize;
    const existing = buckets.get(bucket);
    if (existing) {
      existing.high = Math.max(existing.high, tick.price);
      existing.low = Math.min(existing.low, tick.price);
      existing.close = tick.price;
      existing.volume += tick.volume;
    } else {
      buckets.set(bucket, {
        time: bucket as UTCTimestamp,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
      });
    }
  }

  return [...buckets.values()].sort((left, right) => Number(left.time) - Number(right.time));
}

export function TokenChart({ data, compact = false }: { data: ChartPoint[]; compact?: boolean }) {
  const [range, setRange] = useState<ChartRange>("24h");
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candles = useMemo(() => buildCandles(data, compact ? "All" : range), [compact, data, range]);
  const latestCandle = candles.at(-1);

  useEffect(() => {
    let disposed = false;
    async function createTradingChart() {
      const container = containerRef.current;
      if (!container) return;
      const {
        CandlestickSeries,
        ColorType,
        CrosshairMode,
        HistogramSeries,
        createChart,
      } = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = createChart(container, {
        autoSize: true,
        height: compact ? 144 : 360,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#64748b",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 10,
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: "rgba(37, 49, 71, 0.35)" },
          horzLines: { color: "rgba(37, 49, 71, 0.45)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: "#253147",
          scaleMargins: { top: 0.08, bottom: 0.24 },
        },
        timeScale: {
          borderColor: "#253147",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 4,
          barSpacing: compact ? 8 : 18,
          minBarSpacing: 4,
        },
        handleScroll: !compact,
        handleScale: !compact,
        localization: { priceFormatter: tokenPrice },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#34d399",
        downColor: "#fb7185",
        borderVisible: false,
        wickUpColor: "#34d399",
        wickDownColor: "#fb7185",
        priceLineColor: "#41d9ff",
        priceLineWidth: 1,
        priceFormat: { type: "price", precision: 10, minMove: 0.0000000001 },
      });
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;
      setReady(true);
    }
    void createTradingChart();
    return () => {
      disposed = true;
      setReady(false);
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    if (!ready || !chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(candles.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
    volumeSeriesRef.current.setData(candles.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? "rgba(52, 211, 153, 0.32)" : "rgba(251, 113, 133, 0.32)",
    })));
    chartRef.current.timeScale().applyOptions({ secondsVisible: range === "5m" });
    chartRef.current.timeScale().fitContent();
  }, [candles, range, ready]);

  return <div className={compact ? "h-36" : "h-[430px]"}>
    {!compact && <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-3"><div><p className="text-xs text-slate-500">Price · USDC</p><p className="mt-1 text-xl font-semibold text-white">{tokenPrice(data.at(-1)?.price ?? 0)}</p></div><span className="rounded-md border border-line bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">OHLC · onchain</span></div>
        {latestCandle && <div className="mt-2 flex flex-wrap gap-3 font-mono text-[9px] text-slate-500"><span>O <b className="font-normal text-slate-300">{tokenPrice(latestCandle.open)}</b></span><span>H <b className="font-normal text-emerald-300">{tokenPrice(latestCandle.high)}</b></span><span>L <b className="font-normal text-rose-300">{tokenPrice(latestCandle.low)}</b></span><span>C <b className="font-normal text-slate-300">{tokenPrice(latestCandle.close)}</b></span></div>}
      </div>
      <div className="flex flex-wrap items-center gap-1">{ranges.map((item) => <Button key={item} variant="ghost" className={range === item ? "h-8 bg-white/[.07] px-3 text-white" : "h-8 px-3"} onClick={() => setRange(item)}>{item}</Button>)}</div>
    </div>}
    <div ref={containerRef} className={compact ? "h-36 w-full" : "h-[350px] w-full"} aria-label="Interactive candlestick price chart" />
    {!compact && <div className="mt-2 flex items-center justify-between text-[9px] text-slate-600"><span>Scroll to move · pinch or wheel to zoom · volume below candles</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="transition hover:text-cyan">Charts by TradingView</a></div>}
  </div>;
}
