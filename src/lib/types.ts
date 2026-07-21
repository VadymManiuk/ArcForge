export type RiskLabel =
  | "fixed_supply"
  | "standard_template"
  | "no_hidden_mint"
  | "no_blacklist"
  | "creator_allocation_visible"
  | "creator_allocation_low"
  | "socials_present"
  | "low_holder_concentration"
  | "known_creator"
  | "high_creator_concentration"
  | "missing_socials"
  | "new_creator"
  | "high_risk";

export type TokenStatus = "Live on curve" | "Graduating soon" | "Graduated" | "Flagged";
export type ChartPoint = { time: string; price: number; volume: number };
export type Trade = {
  time: string;
  type: "Buy" | "Sell";
  wallet: string;
  usdc: number;
  tokens: number;
  price: number;
  txHash: string;
};
export type CreatorProfile = {
  address: string;
  reputation: number;
  launches: number;
  graduated: number;
  flagged: number;
  totalVolume: number;
  totalFees: number;
  verified: boolean;
};
export type TokenData = {
  name: string;
  ticker: string;
  address: string;
  creator: string;
  icon: string;
  description: string;
  ageMinutes: number;
  price: number;
  priceChange24h: number;
  marketCap: number;
  raisedUSDC: number;
  targetUSDC: number;
  volume5m: number;
  volume1h: number;
  volume24h: number;
  buyers: number;
  sellers: number;
  trades: number;
  holders: number;
  curveProgress: number;
  riskScore: number;
  status: TokenStatus;
  chartData: ChartPoint[];
  recentTrades: Trade[];
  riskLabels: RiskLabel[];
  creatorProfile: CreatorProfile;
  socials: { website?: string; x?: string; telegram?: string };
};

export type RiskInputs = {
  fixedSupply: boolean;
  standardTemplate: boolean;
  noBlacklist: boolean;
  noHiddenMint: boolean;
  creatorAllocationPercent: number;
  socialsPresent: boolean;
  verifiedTemplate: boolean;
  topTenHolderPercent: number;
  previousCleanLaunches: number;
};

export type RiskScoreResult = {
  score: number;
  tier: "Clean" | "Moderate" | "High risk" | "Extreme risk";
  labels: RiskLabel[];
};
