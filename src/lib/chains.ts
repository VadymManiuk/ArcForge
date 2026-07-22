import { defineChain, isAddress, type Address } from "viem";

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const EXPLORER_URL = arcTestnet.blockExplorers.default.url;
export const ARC_TESTNET_FIRST_LAUNCH_BLOCK = 53_061_367n;

function configuredAddress(value: string | undefined, fallback: Address): Address {
  return value && isAddress(value) ? value : fallback;
}

export const ARC_TESTNET_CONTRACTS = {
  factory: configuredAddress(
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
    "0xA4DbA45B199287d3163199A86B4618968d8f8424",
  ),
  feeVault: configuredAddress(
    process.env.NEXT_PUBLIC_FEE_VAULT_ADDRESS,
    "0x7bfcdA8108Db53B3cCAe02B29C6e5B3905950fB4",
  ),
  creatorRegistry: configuredAddress(
    process.env.NEXT_PUBLIC_CREATOR_REGISTRY_ADDRESS,
    "0x07287313ee649efcF22EAEE4361cd6c512219B61",
  ),
  usdc: configuredAddress(
    process.env.NEXT_PUBLIC_USDC_ADDRESS,
    "0x3600000000000000000000000000000000000000",
  ),
} as const;

export const ARC_TESTNET_USDC = ARC_TESTNET_CONTRACTS.usdc;
