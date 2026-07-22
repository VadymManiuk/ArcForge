"use client";

import { useFactoryTokenIndex } from "@/hooks/use-factory-token-index";
import { mockTokens } from "@/lib/mock-data";
import { TokenTable } from "./token-table";
import { WarningBox } from "./ui";

export function HomeMarket() {
  const { tokens: indexedTokens, loading, error, isCached, isPartial } = useFactoryTokenIndex();
  const onchainState = isPartial ? "unavailable" : isCached ? "cached" : loading ? "loading" : indexedTokens.length > 0 ? "live" : "unavailable";
  return <>{error && <div className="mb-4"><WarningBox>{isCached && indexedTokens.length > 0 ? `Showing the last confirmed cached snapshot. ${error}` : error}</WarningBox></div>}<TokenTable tokens={[...indexedTokens, ...mockTokens.slice(0, 5)]} compact onchainState={onchainState}/></>;
}
