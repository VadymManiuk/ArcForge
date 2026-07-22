"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { useState, type ReactNode } from "react";
import { arcTestnet } from "@/lib/chains";

const config = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected({ target: "rabby", shimDisconnect: true }),
    injected({ target: "metaMask", shimDisconnect: true }),
    injected({ shimDisconnect: true }),
  ],
  transports: { [arcTestnet.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>;
}
