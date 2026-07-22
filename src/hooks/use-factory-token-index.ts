"use client";

import { useCallback, useEffect, useState } from "react";
import type { HolderSnapshot } from "@/lib/onchain/holder-snapshot";
import type { MarketSnapshot } from "@/lib/onchain/market-snapshot";
import type { TokenData } from "@/lib/types";

const TOKEN_INDEX_CACHE_KEY = "arcorigin:5042002:factory-index-v4";
const TOKEN_INDEX_CACHE_TTL = 6 * 60 * 60 * 1_000;

type CachedIndex = { savedAt: number; tokens: TokenData[] };
type TokenIndexSnapshot = { tokens: TokenData[]; indexedBlock: string; generatedAt: string };

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isCachedToken(value: unknown): value is TokenData {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<TokenData>;
  return token.source === "onchain"
    && typeof token.name === "string"
    && typeof token.ticker === "string"
    && isAddress(token.address)
    && isAddress(token.curveAddress)
    && isAddress(token.creator)
    && typeof token.launchBlock === "number"
    && typeof token.launchTxHash === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(token.launchTxHash)
    && typeof token.price === "number"
    && Number.isFinite(token.price)
    && typeof token.marketCap === "number"
    && Number.isFinite(token.marketCap)
    && Array.isArray(token.chartData)
    && Array.isArray(token.recentTrades)
    && Array.isArray(token.riskLabels)
    && Boolean(token.creatorProfile);
}

function readCachedIndex(): CachedIndex | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_INDEX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedIndex>;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TOKEN_INDEX_CACHE_TTL) return null;
    if (!Array.isArray(parsed.tokens) || parsed.tokens.length === 0 || parsed.tokens.length > 100 || !parsed.tokens.every(isCachedToken)) return null;
    return { savedAt: parsed.savedAt, tokens: parsed.tokens };
  } catch {
    return null;
  }
}

function writeCachedIndex(tokens: TokenData[]) {
  try {
    const snapshot: CachedIndex = { savedAt: Date.now(), tokens };
    window.localStorage.setItem(TOKEN_INDEX_CACHE_KEY, JSON.stringify(snapshot));
    return snapshot.savedAt;
  } catch {
    return null;
  }
}

function applySnapshot(token: TokenData, snapshot: MarketSnapshot, holderSnapshot: HolderSnapshot | null): TokenData {
  return {
    ...token,
    price: snapshot.price,
    priceChange24h: snapshot.priceChange,
    marketCap: snapshot.marketCap,
    raisedUSDC: snapshot.raisedUsdc,
    targetUSDC: snapshot.targetUsdc,
    volume5m: 0,
    volume1h: 0,
    volume24h: snapshot.volume,
    buyers: snapshot.buyers,
    sellers: snapshot.sellers,
    trades: snapshot.trades.length,
    holders: holderSnapshot?.holders ?? 0,
    curveProgress: snapshot.progress,
    status: snapshot.graduated ? "Graduated" : snapshot.progress >= 75 ? "Graduating soon" : "Live on curve",
    chartData: snapshot.chart,
    recentTrades: snapshot.trades,
    creatorProfile: { ...token.creatorProfile, totalVolume: snapshot.volume },
  };
}

async function loadServerSnapshot<T>(path: string): Promise<{ snapshot: T; stale: boolean }> {
  const response = await fetch(path);
  const payload = await response.json() as { snapshot?: T; stale?: boolean; error?: string };
  if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "Onchain snapshot is unavailable.");
  return { snapshot: payload.snapshot, stale: Boolean(payload.stale) };
}

async function loadFactoryTokens(
  includeMarketData: boolean,
  forceRefresh: boolean,
  onIndexLoaded?: (tokens: TokenData[], stale: boolean) => void,
) {
  const indexPath = `/api/onchain/tokens${forceRefresh ? "?refresh=1" : ""}`;
  const indexResult = await loadServerSnapshot<TokenIndexSnapshot>(indexPath);
  if (!includeMarketData) return { tokens: indexResult.snapshot.tokens, marketDataError: null, stale: indexResult.stale };
  onIndexLoaded?.(indexResult.snapshot.tokens, indexResult.stale);

  const tokens: TokenData[] = [];
  let marketDataError: unknown;
  for (const base of indexResult.snapshot.tokens) {
    const refreshQuery = forceRefresh ? "?refresh=1" : "";
    try {
      const marketResult = await loadServerSnapshot<MarketSnapshot>(`/api/onchain/tokens/${base.address}/market${refreshQuery}`);
      let holderSnapshot: HolderSnapshot | null = null;
      try {
        holderSnapshot = (await loadServerSnapshot<HolderSnapshot>(`/api/onchain/tokens/${base.address}/holders${refreshQuery}`)).snapshot;
      } catch {
        holderSnapshot = null;
      }
      tokens.push(applySnapshot(base, marketResult.snapshot, holderSnapshot));
    } catch (loadError) {
      marketDataError ??= loadError;
      tokens.push(base);
    }
  }
  return { tokens, marketDataError, stale: indexResult.stale };
}

export function useFactoryTokenIndex({ includeMarketData = true, allowCache = true }: { includeMarketData?: boolean; allowCache?: boolean } = {}) {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCached, setIsCached] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const refresh = useCallback(async (forceRefresh = true) => {
    setLoading(true);
    setError("");
    try {
      const result = await loadFactoryTokens(includeMarketData, forceRefresh, (indexedTokens, stale) => {
        setTokens(indexedTokens);
        setIsPartial(false);
        setIsCached(stale);
      });
      setTokens(result.tokens);
      setIsPartial(Boolean(result.marketDataError));
      setIsCached(result.stale);
      setCachedAt(allowCache && includeMarketData ? writeCachedIndex(result.tokens) : null);
      if (result.marketDataError) {
        const message = result.marketDataError instanceof Error ? result.marketDataError.message : String(result.marketDataError);
        setError(`Factory launches are confirmed, but some market values could not be refreshed. ${message}`);
      } else if (result.stale) {
        setError("Showing the latest confirmed Factory snapshot while Arc Testnet RPC recovers.");
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setIsPartial(false);
      setError(message || "Factory launch data could not be indexed from Arc Testnet.");
    } finally {
      setLoading(false);
    }
  }, [allowCache, includeMarketData]);

  useEffect(() => {
    if (allowCache && includeMarketData) {
      const cached = readCachedIndex();
      if (cached) {
        setTokens(cached.tokens);
        setIsCached(true);
        setIsPartial(false);
        setCachedAt(cached.savedAt);
      }
    }
    void refresh(false);
    const handleRefresh = () => void refresh(true);
    window.addEventListener("arcforge:launch-confirmed", handleRefresh);
    window.addEventListener("arcforge:trade-confirmed", handleRefresh);
    return () => {
      window.removeEventListener("arcforge:launch-confirmed", handleRefresh);
      window.removeEventListener("arcforge:trade-confirmed", handleRefresh);
    };
  }, [allowCache, includeMarketData, refresh]);

  return { tokens, loading, error, refresh, isCached, isPartial, cachedAt };
}
