import type { ChartPoint, CreatorProfile, RiskLabel, TokenData, Trade } from "./types";

const addresses = [
  "0x7A4e28dC893514C71C9f6b2E8712c39F92810001", "0x8B5f39eD904625D82D0a7c3F9823d40A03920002",
  "0x9C604aFE015736E93E1b8d409934e51B14030003", "0xAD715B0F126847FA4F2C9E51A045F62C25140004",
  "0xBE826C10237958AB503DAF62B156073D36250005", "0xCF937D21348A69BC614EB073C267184E47360006",
  "0xD0A48E32459B70CD725FC184D378295F58470007", "0xE1B59F4356AC81DE8360D295E4893A6069580008",
  "0xF2C6A05467BD92EF9471E3A6F59A4B717A690009", "0x03D7B16578CEA3F0A582F4B706AB5C828B7A0010",
];
const creators = addresses.map((address, i): CreatorProfile => ({
  address: address.replace(address.slice(-4), `c${String(i + 1).padStart(3, "0")}`),
  reputation: [91, 78, 88, 72, 66, 84, 58, 24, 93, 81][i],
  launches: [7, 2, 5, 1, 3, 6, 1, 4, 9, 3][i],
  graduated: [4, 0, 3, 0, 1, 3, 0, 0, 6, 1][i],
  flagged: i === 7 ? 3 : 0,
  totalVolume: [941000, 148000, 712000, 92000, 284000, 610000, 71000, 43000, 1200000, 330000][i],
  totalFees: [12400, 2040, 8800, 940, 3100, 7600, 820, 120, 15800, 3900][i],
  verified: [true, false, true, false, true, true, false, false, true, true][i],
}));

function chart(seed: number): ChartPoint[] {
  let price = 0.00002 * (seed + 1);
  return Array.from({ length: 48 }, (_, i) => {
    price = Math.max(price * (1 + Math.sin(i * 0.61 + seed) * 0.028 + (seed % 3 - 0.7) * 0.004), 0.000001);
    return { time: `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, price, volume: Math.round((420 + Math.abs(Math.cos(i + seed)) * 2200) * (seed + 1)) };
  });
}

function trades(seed: number, price: number): Trade[] {
  return Array.from({ length: 7 }, (_, i) => ({
    time: `${i * 3 + 1}m ago`, type: (i + seed) % 3 === 0 ? "Sell" : "Buy",
    wallet: addresses[(i + seed + 2) % addresses.length], usdc: 110 + ((i * 431 + seed * 83) % 2200),
    tokens: Math.round((110 + ((i * 431 + seed * 83) % 2200)) / price), price: price * (1 - i * 0.003),
    txHash: `0x${(BigInt((seed + 1) * 100 + i + 2)).toString(16).padStart(64, "0")}`,
  }));
}

const definitions = [
  ["Arc Pepe", "ARCPEPE", "AP", 84, 64, "Live on curve"], ["USDCat", "USDCAT", "UC", 72, 89, "Graduating soon"],
  ["Forge", "FORGE", "FG", 91, 100, "Graduated"], ["Agent X", "AGENTX", "AX", 67, 43, "Live on curve"],
  ["Memo", "MEMO", "ME", 62, 37, "Live on curve"], ["Stable Dog", "STABLEDOG", "SD", 86, 81, "Graduating soon"],
  ["Arc Rocket", "ARCROCKET", "AR", 54, 25, "Live on curve"], ["Risky", "RISKY", "RK", 28, 18, "Flagged"],
  ["Nova", "NOVA", "NV", 94, 100, "Graduated"], ["Vault", "VAULT", "VT", 79, 72, "Live on curve"],
] as const;

const positiveLabels: RiskLabel[] = ["fixed_supply", "standard_template", "no_hidden_mint", "no_blacklist", "creator_allocation_visible", "creator_allocation_low", "socials_present", "low_holder_concentration", "known_creator"];

export const mockTokens: TokenData[] = definitions.map(([name, ticker, icon, riskScore, progress, status], i) => {
  const chartData = chart(i);
  const price = chartData.at(-1)?.price ?? 0;
  const raised = progress * 500;
  const riskLabels = riskScore < 40
    ? ["fixed_supply", "standard_template", "creator_allocation_visible", "high_creator_concentration", "missing_socials", "high_risk"] as RiskLabel[]
    : positiveLabels.slice(0, Math.max(5, Math.round(riskScore / 11)));
  return {
    name, ticker, icon, address: addresses[i], creator: creators[i].address, source: "demo",
    description: `${name} is an independent Arc-native community token launched through ArcOrigin's transparent fixed-supply template.`,
    ageMinutes: [18, 42, 2160, 96, 310, 680, 12, 55, 8200, 1440][i], price,
    priceChange24h: [18.4, 42.1, 7.8, -3.2, 12.4, 31.7, 66.2, -48.3, 4.9, 15.1][i],
    marketCap: Math.round(price * (700_000_000 + i * 20_000_000)), raisedUSDC: raised, targetUSDC: 50_000,
    volume5m: 820 + i * 419, volume1h: 9200 + (9 - i) * 2741, volume24h: 53000 + (i + 1) * 19421,
    buyers: 78 + i * 43, sellers: 22 + i * 19, trades: 146 + i * 88, holders: 91 + i * 67,
    curveProgress: progress, riskScore, status, chartData, recentTrades: trades(i, price), riskLabels,
    creatorProfile: creators[i], socials: i === 7 ? {} : { website: "https://arcorigin.xyz", x: "https://x.com", telegram: "https://t.me" },
  };
});

export const genesisToken: TokenData = {
  name: "ArcForge Genesis",
  ticker: "AFG",
  icon: "AF",
  address: "0x349c2ee885bfdd3e7f45faf0b3c636c7556515de",
  curveAddress: "0x4fa8f368969754b434e624b6685167b72d77f37b",
  creator: "0x2807b95e05649b7befe74c4061f9492c5b889a42",
  source: "onchain",
  creatorAllocationPercent: 5,
  launchTxHash: "0xb877ea3090870b4b98e8cb64aab069dbaa2fb5db2a871c7ecd077c9416a9952d",
  launchBlock: 53_061_367,
  totalSupply: 1_000_000_000,
  virtualUsdcReserve: 10_000,
  description: "The original ArcForge-branded genesis token deployed before the ArcOrigin product rebrand.",
  ageMinutes: 0,
  price: 0.00001,
  priceChange24h: 0,
  marketCap: 10_000,
  raisedUSDC: 0,
  targetUSDC: 50_000,
  volume5m: 0,
  volume1h: 0,
  volume24h: 0,
  buyers: 0,
  sellers: 0,
  trades: 0,
  holders: 2,
  curveProgress: 0,
  riskScore: 76,
  status: "Live on curve",
  chartData: [{ time: "Launch", price: 0.00001, volume: 0 }],
  recentTrades: [],
  riskLabels: [
    "fixed_supply",
    "standard_template",
    "no_hidden_mint",
    "no_blacklist",
    "creator_allocation_visible",
    "creator_allocation_low",
    "missing_socials",
    "new_creator",
  ],
  creatorProfile: {
    address: "0x2807b95e05649b7befe74c4061f9492c5b889a42",
    reputation: 50,
    launches: 1,
    graduated: 0,
    flagged: 0,
    totalVolume: 0,
    totalFees: 25,
    verified: false,
  },
  socials: {},
};

export const allTokens: TokenData[] = [genesisToken, ...mockTokens];

export function getToken(addressOrTicker: string) {
  return allTokens.find((token) => token.address.toLowerCase() === addressOrTicker.toLowerCase() || token.ticker.toLowerCase() === addressOrTicker.toLowerCase());
}

export function getCreator(address: string) {
  return creators.find((creator) => creator.address.toLowerCase() === address.toLowerCase());
}
