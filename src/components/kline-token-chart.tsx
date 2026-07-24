"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Camera,
  ChevronDown,
  Crosshair,
  Expand,
  Eye,
  EyeOff,
  Focus,
  Minus,
  MoveVertical,
  Ruler,
  Settings2,
  TrendingUp,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Chart as KLineChart, KLineData, OverlayCreate, Period } from "klinecharts";
import type { ChartPoint, Trade } from "@/lib/types";
import { money } from "@/lib/utils";
import { buildCandles, type ChartTimeframe } from "@/components/token-chart";

const timeframes = ["1s", "30s", "1m", "5m", "15m", "1h", "4h", "1d"] as const;
type DisplayMode = "Price" | "MCap";
type IndicatorName = "MA" | "EMA" | "VOL";
type Tool = "cursor" | "straightLine" | "horizontalStraightLine" | "verticalStraightLine" | "priceLine";

type TokenChartProps = {
  data: ChartPoint[];
  trades?: Trade[];
  compact?: boolean;
  tokenName?: string;
  ticker?: string;
  totalSupply?: number;
};

function precisionFor(value: number) {
  if (!Number.isFinite(value) || value === 0) return 8;
  return Math.max(2, Math.min(10, Math.ceil(-Math.log10(Math.abs(value))) + 3));
}

function formatPrice(value: number, mode: DisplayMode) {
  if (!Number.isFinite(value)) return "-";
  if (mode === "MCap") return money(value, true);
  if (value === 0) return "$0";
  if (value < 0.000001) return `$${value.toFixed(10)}`;
  if (value < 0.01) return `$${value.toFixed(8)}`;
  return money(value);
}

function periodFor(timeframe: ChartTimeframe): Period {
  if (timeframe.endsWith("s")) return { type: "second", span: Number.parseInt(timeframe, 10) };
  if (timeframe.endsWith("m")) return { type: "minute", span: Number.parseInt(timeframe, 10) };
  if (timeframe.endsWith("h")) return { type: "hour", span: Number.parseInt(timeframe, 10) };
  return { type: "day", span: 1 };
}

function toolLabel(tool: Tool) {
  switch (tool) {
    case "straightLine": return "Trend line";
    case "horizontalStraightLine": return "Horizontal line";
    case "verticalStraightLine": return "Vertical line";
    case "priceLine": return "Price measurement";
    default: return "Cursor";
  }
}

/**
 * Professional K-line terminal powered exclusively by ArcOrigin's onchain candles.
 * No exchange or simulated market data is sent to the chart library.
 */
export function KLineTokenChart({
  data,
  trades = [],
  compact = false,
  tokenName = "Token",
  ticker = "TOKEN",
  totalSupply = 1_000_000_000,
}: TokenChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1m");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("Price");
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorName>>(new Set(["VOL"]));
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [tool, setTool] = useState<Tool>("cursor");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<KLineChart | null>(null);
  const dataRef = useRef<KLineData[]>([]);
  const indicatorIdsRef = useRef<Record<IndicatorName, string | null>>({ MA: null, EMA: null, VOL: null });
  const [ready, setReady] = useState(false);

  const sourceCandles = useMemo(() => buildCandles(data, compact ? "1h" : timeframe), [compact, data, timeframe]);
  const multiplier = displayMode === "MCap" ? totalSupply : 1;
  const candles = useMemo<KLineData[]>(() => sourceCandles.map((candle) => ({
    timestamp: Number(candle.time) * 1000,
    open: candle.open * multiplier,
    high: candle.high * multiplier,
    low: candle.low * multiplier,
    close: candle.close * multiplier,
    volume: candle.volume,
    turnover: candle.volume,
  })), [multiplier, sourceCandles]);
  const latest = candles.at(-1);
  const activeChange = latest && latest.open > 0 ? ((latest.close / latest.open) - 1) * 100 : 0;

  useEffect(() => {
    dataRef.current = candles;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker, pricePrecision: precisionFor(latest?.close ?? 0.00000001), volumePrecision: 2 });
    chart.setPeriod(periodFor(compact ? "1h" : timeframe));
  }, [candles, compact, latest?.close, ticker, timeframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let disposeChart: ((target: HTMLElement | KLineChart | string) => void) | null = null;

    async function mount() {
      const { dispose, init } = await import("klinecharts");
      if (disposed || !containerRef.current) return;
      disposeChart = dispose;
      const chart = init(containerRef.current, {
        timezone: "Etc/UTC",
        styles: {
          grid: {
            show: true,
            horizontal: { show: true, size: 1, style: "dashed", dashedValue: [4, 4], color: "rgba(56, 67, 73, .42)" },
            vertical: { show: true, size: 1, style: "dashed", dashedValue: [4, 4], color: "rgba(56, 67, 73, .36)" },
          },
          candle: {
            type: "candle_solid",
            bar: {
              upColor: "#28c6b8", downColor: "#fa6374", noChangeColor: "#7d8b91",
              upBorderColor: "#28c6b8", downBorderColor: "#fa6374", noChangeBorderColor: "#7d8b91",
              upWickColor: "#28c6b8", downWickColor: "#fa6374", noChangeWickColor: "#7d8b91",
              compareRule: "current_open",
            },
            tooltip: { showRule: "follow_cross", showType: "standard" },
          },
          xAxis: { axisLine: { show: true, color: "#273138", size: 1 }, tickLine: { show: false, color: "#273138", size: 1, length: 0 }, tickText: { show: true, color: "#87939b", size: 10, family: "ui-monospace, SFMono-Regular, monospace", weight: "normal", marginStart: 4, marginEnd: 4 } },
          yAxis: { axisLine: { show: true, color: "#273138", size: 1 }, tickLine: { show: false, color: "#273138", size: 1, length: 0 }, tickText: { show: true, color: "#87939b", size: 10, family: "ui-monospace, SFMono-Regular, monospace", weight: "normal", marginStart: 4, marginEnd: 6 } },
          crosshair: {
            horizontal: { show: true, line: { show: true, style: "dashed", dashedValue: [4, 4], color: "rgba(226,232,240,.45)", size: 1 }, text: { show: true, style: "fill", color: "#e8edf0", size: 10, family: "ui-monospace, monospace", weight: "normal", borderStyle: "solid", borderDashedValue: [], borderSize: 0, borderColor: "transparent", borderRadius: 2, backgroundColor: "#273138", paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 }, features: [] },
            vertical: { show: true, line: { show: true, style: "dashed", dashedValue: [4, 4], color: "rgba(226,232,240,.38)", size: 1 }, text: { show: true, style: "fill", color: "#e8edf0", size: 10, family: "ui-monospace, monospace", weight: "normal", borderStyle: "solid", borderDashedValue: [], borderSize: 0, borderColor: "transparent", borderRadius: 2, backgroundColor: "#273138", paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 } },
          },
        },
      });
      if (!chart) return;
      chart.setDataLoader({
        getBars: ({ callback }) => callback(dataRef.current, { backward: false, forward: false }),
      });
      chart.setSymbol({ ticker, pricePrecision: 8, volumePrecision: 2 });
      chart.setPeriod(periodFor(compact ? "1h" : "1m"));
      chart.setOffsetRightDistance(60);
      chartRef.current = chart;
      setReady(true);
      window.requestAnimationFrame(() => chart.resize());
    }
    void mount();
    return () => {
      disposed = true;
      setReady(false);
      if (chartRef.current && disposeChart) disposeChart(chartRef.current);
      chartRef.current = null;
      indicatorIdsRef.current = { MA: null, EMA: null, VOL: null };
    };
  }, [compact, ticker]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    chart.setStyles({ grid: { show: showGrid } });
  }, [ready, showGrid]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    for (const name of ["MA", "EMA", "VOL"] as const) {
      const existing = indicatorIdsRef.current[name];
      const enabled = activeIndicators.has(name);
      if (enabled && !existing) {
        indicatorIdsRef.current[name] = chart.createIndicator(
          name === "VOL" ? name : { name, paneId: "candle_pane", calcParams: [20] },
          name === "VOL",
        );
      }
      if (!enabled && existing) {
        chart.removeIndicator({ id: existing });
        indicatorIdsRef.current[name] = null;
      }
    }
  }, [activeIndicators, ready]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    chart.removeOverlay({ groupId: "arc-origin-trades" });
    if (!showMarkers) return;
    const earliest = candles[0]?.timestamp ?? 0;
    const latestTimestamp = candles.at(-1)?.timestamp ?? 0;
    const markers: OverlayCreate[] = trades
      .filter((trade) => Number.isFinite(trade.timestamp) && (trade.timestamp ?? 0) * 1000 >= earliest && (trade.timestamp ?? 0) * 1000 <= latestTimestamp)
      .map((trade) => ({
        name: "simpleTag",
        groupId: "arc-origin-trades",
        points: [{ timestamp: (trade.timestamp ?? 0) * 1000, value: trade.price * multiplier }],
        extendData: `${trade.type === "Buy" ? "B" : "S"} $${trade.usdc.toFixed(2)}`,
        styles: {
          line: { color: trade.type === "Buy" ? "#28c6b8" : "#fa6374" },
          text: { color: trade.type === "Buy" ? "#6ee7d9" : "#fda4af" },
        },
      }));
    if (markers.length > 0) chart.createOverlay(markers);
  }, [candles, multiplier, ready, showMarkers, trades]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const chooseTool = useCallback((nextTool: Tool) => {
    setTool(nextTool);
    if (nextTool === "cursor") return;
    const overlay: OverlayCreate = { name: nextTool };
    chartRef.current?.createOverlay(overlay);
  }, []);

  const toggleIndicator = useCallback((name: IndicatorName) => {
    setActiveIndicators((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const zoom = useCallback((factor: number) => chartRef.current?.zoomAtCoordinate(factor), []);
  const fit = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.scrollToRealTime();
    chart.setBarSpace(9);
  }, []);
  const clearDrawings = useCallback(() => chartRef.current?.removeOverlay(), []);
  const capture = useCallback(() => setSnapshot(chartRef.current?.getConvertPictureUrl(true, "png", "#111417") ?? ""), []);
  const toggleFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current.requestFullscreen();
  }, []);
  const moveToLatest = useCallback(() => chartRef.current?.scrollToRealTime(), []);

  if (compact) return <div ref={shellRef} className="h-36 overflow-hidden"><div ref={containerRef} className="h-36 w-full" aria-label="ArcOrigin onchain candlestick chart" /></div>;

  return <div ref={shellRef} className={`relative overflow-hidden bg-[#111417] ${isFullscreen ? "h-screen w-screen p-3" : "rounded-xl border border-line"}`}>
    <div className="relative z-20 flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line bg-[#0e1114] px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {timeframes.map((item) => <ChartButton key={item} active={timeframe === item} onClick={() => setTimeframe(item)}>{item}</ChartButton>)}
        <span className="mx-1 h-5 w-px bg-line" />
        <div className="relative">
          <ChartButton active={indicatorsOpen || activeIndicators.size > 1} onClick={() => { setIndicatorsOpen((value) => !value); setSettingsOpen(false); }}><Activity className="size-4" />Indicators<ChevronDown className="size-3" /></ChartButton>
          {indicatorsOpen && <ChartMenu><Toggle label="Moving average" value="MA 20" active={activeIndicators.has("MA")} onClick={() => toggleIndicator("MA")} /><Toggle label="Exponential MA" value="EMA 20" active={activeIndicators.has("EMA")} onClick={() => toggleIndicator("EMA")} /><Toggle label="Volume" value="Onchain USDC" active={activeIndicators.has("VOL")} onClick={() => toggleIndicator("VOL")} /></ChartMenu>}
        </div>
        <span className="mx-1 h-5 w-px bg-line" />
        {(["Price", "MCap"] as const).map((item) => <ChartButton key={item} active={displayMode === item} onClick={() => setDisplayMode(item)}>{item}</ChartButton>)}
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Fit chart" onClick={fit}><Focus className="size-4" /></IconButton>
        <IconButton label="Zoom in" onClick={() => zoom(1.25)}><ZoomIn className="size-4" /></IconButton>
        <IconButton label="Zoom out" onClick={() => zoom(.8)}><ZoomOut className="size-4" /></IconButton>
        <div className="relative"><IconButton label="Chart settings" active={settingsOpen} onClick={() => { setSettingsOpen((value) => !value); setIndicatorsOpen(false); }}><Settings2 className="size-4" /></IconButton>{settingsOpen && <ChartMenu right><Toggle label="Grid" value="Chart grid" active={showGrid} onClick={() => setShowGrid((value) => !value)} /><Toggle label="Trade markers" value="Verified trades" active={showMarkers} onClick={() => setShowMarkers((value) => !value)} /></ChartMenu>}</div>
        <IconButton label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} active={isFullscreen} onClick={() => void toggleFullscreen()}><Expand className="size-4" /></IconButton>
        <IconButton label="Capture chart screenshot" onClick={capture}><Camera className="size-4" /></IconButton>
      </div>
    </div>
    <div className="grid grid-cols-[42px_minmax(0,1fr)]">
      <aside className="flex flex-col items-center gap-1 border-r border-line bg-[#0e1114] py-2">
        <IconButton label="Crosshair cursor" active={tool === "cursor"} onClick={() => chooseTool("cursor")}><Crosshair className="size-4" /></IconButton>
        <IconButton label="Draw trend line" active={tool === "straightLine"} onClick={() => chooseTool("straightLine")}><TrendingUp className="size-4" /></IconButton>
        <IconButton label="Draw horizontal line" active={tool === "horizontalStraightLine"} onClick={() => chooseTool("horizontalStraightLine")}><Minus className="size-4" /></IconButton>
        <IconButton label="Draw vertical line" active={tool === "verticalStraightLine"} onClick={() => chooseTool("verticalStraightLine")}><MoveVertical className="size-4" /></IconButton>
        <IconButton label="Measure price" active={tool === "priceLine"} onClick={() => chooseTool("priceLine")}><Ruler className="size-4" /></IconButton>
        <span className="my-1 h-px w-6 bg-line" />
        <IconButton label="Show trade markers" active={showMarkers} onClick={() => setShowMarkers((value) => !value)}>{showMarkers ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</IconButton>
        <IconButton label="Clear drawings" onClick={clearDrawings}><Trash2 className="size-4" /></IconButton>
      </aside>
      <div className="relative min-w-0">
        <div className="pointer-events-none absolute left-4 top-3 z-10 max-w-[calc(100%-32px)] text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="text-sm text-white">{tokenName} · {timeframe}</b><span className="text-slate-500">ArcOrigin onchain terminal</span>{latest && <><span className="font-mono text-slate-400">O {formatPrice(latest.open, displayMode)}</span><span className="font-mono text-emerald-300">H {formatPrice(latest.high, displayMode)}</span><span className="font-mono text-rose-300">L {formatPrice(latest.low, displayMode)}</span><span className="font-mono text-white">C {formatPrice(latest.close, displayMode)}</span><span className={activeChange >= 0 ? "text-emerald-300" : "text-rose-300"}>{activeChange >= 0 ? "+" : ""}{activeChange.toFixed(2)}%</span></>}</div>
          <div className="mt-1 font-mono text-[10px] text-slate-500">{showMarkers ? `${trades.length} verified onchain trades` : "Trade markers hidden"} · {tool === "cursor" ? "Select a drawing tool" : `${toolLabel(tool)}: click chart to draw`}</div>
        </div>
        <div ref={containerRef} className={isFullscreen ? "h-[calc(100vh-112px)] min-h-[480px] w-full" : "h-[480px] w-full"} aria-label="ArcOrigin onchain candlestick chart" />
      </div>
    </div>
    <div className="flex min-h-10 items-center justify-between border-t border-line bg-[#0e1114] px-3 py-1"><span className="font-mono text-[10px] text-slate-500">Only verified Arc Testnet factory and curve events</span><div className="flex items-center gap-1"><ChartButton onClick={moveToLatest}>Latest</ChartButton><IconButton label="Reset chart" onClick={fit}><Focus className="size-3.5" /></IconButton></div></div>
    {snapshot && <div role="dialog" aria-label="Chart screenshot preview" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-line bg-[#11161a] p-4">
        <div className="mb-3 flex justify-between"><b className="text-white">{ticker} chart</b><button type="button" onClick={() => setSnapshot("")} className="text-xs text-slate-400">Close</button></div>
        {/* The generated source is an in-memory canvas data URL, not untrusted remote content. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snapshot} alt={`${ticker} onchain chart`} className="max-h-[70vh] w-full rounded-xl object-contain" />
        <a href={snapshot} download={`${ticker.toLowerCase()}-onchain-chart.png`} className="mt-3 inline-flex rounded-lg bg-cyan px-3 py-2 text-xs font-semibold text-[#07110e]">Download PNG</a>
      </div>
    </div>}
  </div>;
}

function ChartButton({ active = false, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition ${active ? "bg-cyan/15 text-[#a5f3d7]" : "text-slate-400 hover:bg-white/[.05] hover:text-white"}`}>{children}</button>; }
function IconButton({ label, active = false, children, onClick }: { label: string; active?: boolean; children: React.ReactNode; onClick: () => void }) { return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={`grid size-8 place-items-center rounded-md transition ${active ? "bg-cyan/15 text-[#a5f3d7]" : "text-slate-400 hover:bg-white/[.05] hover:text-white"}`}>{children}</button>; }
function ChartMenu({ children, right = false }: { children: React.ReactNode; right?: boolean }) { return <div className={`absolute top-10 z-40 w-56 rounded-lg border border-line bg-[#13191d] p-1.5 shadow-2xl ${right ? "right-0" : "left-0"}`}>{children}</div>; }
function Toggle({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-white/[.05]"><span><span className="block text-xs text-slate-200">{label}</span><span className="block text-[10px] text-slate-500">{value}</span></span><span className={`h-4 w-7 rounded-full p-0.5 ${active ? "bg-cyan" : "bg-slate-700"}`}><span className={`block size-3 rounded-full bg-white transition ${active ? "translate-x-3" : ""}`} /></span></button>; }
