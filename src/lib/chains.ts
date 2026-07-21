import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const EXPLORER_URL = arcTestnet.blockExplorers.default.url;
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
export const IS_DEMO_MODE = !process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
