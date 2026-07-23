"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartPoint } from "@/lib/types";
import { money } from "@/lib/utils";
import { Button } from "./ui";

const timeframes = ["1s", "1m", "5m", "15m", "1h", "4h", "1d"] as const;
type ChartTimeframe = (typeof timeframes)[number];

const timeframeSeconds: Record<ChartTimeframe, number> = {
  "1s": 1,
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
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

export function buildCandles(data: ChartPoint[], timeframe: ChartTimeframe): Candle[] {
  if (data.length === 0) return [];
  const fallbackStart = 1_700_000_000;
  const ticks = data.map((point, index) => ({
    price: point.price,
    volume: point.volume,
    timestamp: point.timestamp ?? fallbackStart + index * 60,
  })).filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (ticks.length === 0) return [];

  const bucketSize = timeframeSeconds[timeframe];
  const buckets = new Map<number, Candle>();
  let previousClose: number | undefined;

  for (const tick of ticks) {
    const bucket = Math.floor(tick.timestamp / bucketSize) * bucketSize;
    const existing = buckets.get(bucket);
    if (existing) {
      existing.high = Math.max(existing.high, tick.price);
      existing.low = Math.min(existing.low, tick.price);
      existing.close = tick.price;
      existing.volume += tick.volume;
    } else {
      const open = previousClose ?? tick.price;
      buckets.set(bucket, {
        time: bucket as UTCTimestamp,
        open,
        high: Math.max(open, tick.price),
        low: Math.min(open, tick.price),
        close: tick.price,
        volume: tick.volume,
      });
    }
    previousClose = tick.price;
  }

  return [...buckets.values()]
    .sort((left, right) => Number(left.time) - Number(right.time))
    .slice(-600);
}

export function TokenChart({ data, compact = false }: { data: ChartPoint[]; compact?: boolean }) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1m");
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const candleMapRef = useRef(new Map<number, Candle>());
  const candles = useMemo(() => buildCandles(data, compact ? "1h" : timeframe), [compact, data, timeframe]);
  const latestCandle = candles.at(-1);
  const activeCandle = hoveredCandle ?? latestCandle;

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
          textColor: "#667174",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: 10,
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: "rgba(37, 43, 45, 0.5)" },
          horzLines: { color: "rgba(37, 43, 45, 0.6)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: "#252b2d",
          scaleMargins: { top: 0.08, bottom: 0.24 },
        },
        timeScale: {
          borderColor: "#252b2d",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: compact ? 7 : 10,
          minBarSpacing: 2,
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
        priceLineColor: "#79e7c5",
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
      chart.subscribeCrosshairMove((parameter) => {
        if (typeof parameter.time !== "number") {
          setHoveredCandle(null);
          return;
        }
        setHoveredCandle(candleMapRef.current.get(parameter.time) ?? null);
      });
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
    candleMapRef.current = new Map(candles.map((candle) => [Number(candle.time), candle]));
    setHoveredCandle(null);
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
    chartRef.current.timeScale().applyOptions({ secondsVisible: timeframe === "1s" });
    if (compact) {
      chartRef.current.timeScale().fitContent();
    } else {
      const visibleBars = Math.max(60, Math.min(120, candles.length));
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: candles.length - visibleBars,
        to: candles.length + 5,
      });
    }
  }, [candles, compact, ready, timeframe]);

  return <div className={compact ? "h-36" : "h-[430px]"}>
    {!compact && <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-3"><div><p className="text-xs text-slate-500">Price · USDC</p><p className="mt-1 text-xl font-semibold text-white">{tokenPrice(data.at(-1)?.price ?? 0)}</p></div><span className="rounded-md border border-line bg-black/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">OHLC · onchain</span></div>
        {activeCandle && <div className="mt-2 flex flex-wrap gap-3 font-mono text-[9px] text-slate-500"><span>O <b className="font-normal text-slate-300">{tokenPrice(activeCandle.open)}</b></span><span>H <b className="font-normal text-emerald-300">{tokenPrice(activeCandle.high)}</b></span><span>L <b className="font-normal text-rose-300">{tokenPrice(activeCandle.low)}</b></span><span>C <b className="font-normal text-slate-300">{tokenPrice(activeCandle.close)}</b></span><span>V <b className="font-normal text-slate-300">{money(activeCandle.volume)}</b></span></div>}
      </div>
      <div>
        <p className="mb-1.5 text-right font-mono text-[9px] uppercase tracking-wider text-slate-600">Candle interval</p>
        <div className="flex flex-wrap items-center justify-end gap-1">{timeframes.map((item) => <Button key={item} variant="ghost" className={timeframe === item ? "h-8 bg-white/[.07] px-3 text-white" : "h-8 px-3"} onClick={() => setTimeframe(item)}>{item}</Button>)}</div>
      </div>
    </div>}
    <div ref={containerRef} className={compact ? "h-36 w-full" : "h-[350px] w-full"} aria-label="Interactive candlestick price chart" />
    {!compact && <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-slate-600"><span>Drag to move · wheel to zoom · volume below candles</span><span>Each candle = {timeframe}</span></div>}
  </div>;
}
