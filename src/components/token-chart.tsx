"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "@/lib/types";
import { money } from "@/lib/utils";
import { Button } from "./ui";

const ranges = ["5m", "1h", "6h", "24h", "All"];

export function TokenChart({ data, compact = false }: { data: ChartPoint[]; compact?: boolean }) {
  const [range, setRange] = useState("24h");
  const [mounted, setMounted] = useState(false);
  const visible = useMemo(() => data.slice(-({ "5m": 8, "1h": 16, "6h": 28, "24h": 40, All: data.length }[range] ?? data.length)), [data, range]);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={compact ? "h-36 animate-pulse rounded-xl bg-white/[.025]" : "h-[360px] animate-pulse rounded-xl bg-white/[.025]"} aria-label="Loading chart" />;
  const Chart = compact ? AreaChart : ComposedChart;
  return <div className={compact ? "h-36" : "h-[360px]"}>{!compact && <div className="mb-5 flex items-center justify-between"><div><p className="text-xs text-slate-500">Price · USDC</p><p className="mt-1 text-xl font-semibold text-white">{money(data.at(-1)?.price ?? 0)}</p></div><div className="flex gap-1">{ranges.map((item) => <Button key={item} variant="ghost" className={range === item ? "h-8 bg-white/[.07] px-3 text-white" : "h-8 px-3"} onClick={() => setRange(item)}>{item}</Button>)}</div></div>}<ResponsiveContainer width="100%" height="100%"><Chart data={visible} margin={{ top: 8, right: 4, left: compact ? -56 : -12, bottom: compact ? 0 : 24 }}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#41d9ff" stopOpacity={0.28}/><stop offset="100%" stopColor="#41d9ff" stopOpacity={0}/></linearGradient></defs>{!compact && <CartesianGrid vertical={false} strokeDasharray="3 3" />}<XAxis dataKey="time" hide={compact} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis yAxisId="price" domain={["dataMin * 0.96", "dataMax * 1.04"]} tickFormatter={(v) => money(v)} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/>{!compact && <YAxis yAxisId="volume" orientation="right" hide domain={[0, "dataMax * 4"]}/>}<Tooltip contentStyle={{ background: "#0b1019", border: "1px solid #253147", borderRadius: 12, fontSize: 11 }} formatter={(value, name) => name === "price" ? [money(Number(value)), "Price"] : [money(Number(value), true), "Volume"]}/>{!compact && <Bar yAxisId="volume" dataKey="volume" fill="#8a7dff" opacity={0.18} radius={[2,2,0,0]}/>}<Area yAxisId="price" type="monotone" dataKey="price" stroke="#41d9ff" strokeWidth={compact ? 1.5 : 2} fill="url(#priceFill)" dot={false} activeDot={{ r: 4, fill: "#41d9ff" }}/></Chart></ResponsiveContainer></div>;
}
