"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/utils";

export type RevenuePoint = { block: string; revenue: number };

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-72 animate-pulse rounded-xl bg-white/[.025]" aria-label="Loading revenue chart"/>;
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a7dff" stopOpacity=".35"/><stop offset="1" stopColor="#8a7dff" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="block" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tickFormatter={(value) => money(value, true)} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#0b1019", border: "1px solid #253147", borderRadius: 12, fontSize: 11 }} formatter={(value) => [money(Number(value)), "Fees collected"]}/><Area type="monotone" dataKey="revenue" stroke="#8a7dff" strokeWidth={2} fill="url(#revenue)"/></AreaChart></ResponsiveContainer></div>;
}
