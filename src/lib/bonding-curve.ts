export const DEFAULT_VIRTUAL_USDC_RESERVE = 2_500;
export const DEFAULT_GRADUATION_THRESHOLD = 10_000;
export const GRADUATION_RESERVE_MULTIPLIER = 4;

export function usesPermanentLiquidityMode(virtualUsdcReserve: number | undefined, graduationThreshold: number) {
  return virtualUsdcReserve !== undefined
    && Math.abs(graduationThreshold - virtualUsdcReserve * GRADUATION_RESERVE_MULTIPLIER) < 0.000001;
}

export function calculateCurveEconomics({
  totalSupply,
  creatorAllocationPercent,
  virtualUsdcReserve,
  graduationThreshold,
}: {
  totalSupply: number;
  creatorAllocationPercent: number;
  virtualUsdcReserve: number;
  graduationThreshold: number;
}) {
  const initialTokenReserve = totalSupply * (1 - creatorAllocationPercent / 100);
  const graduationTokenReserve = initialTokenReserve * virtualUsdcReserve
    / (virtualUsdcReserve + graduationThreshold);
  const tokensSoldAtGraduation = initialTokenReserve - graduationTokenReserve;
  const graduationPrice = (virtualUsdcReserve + graduationThreshold) / graduationTokenReserve;
  const permanentTokenLiquidity = graduationThreshold / graduationPrice;
  return {
    initialTokenReserve,
    graduationTokenReserve,
    tokensSoldAtGraduation,
    curveInventorySoldPercent: tokensSoldAtGraduation / initialTokenReserve * 100,
    totalSupplySoldPercent: tokensSoldAtGraduation / totalSupply * 100,
    graduationPrice,
    graduationMarketCap: graduationPrice * totalSupply,
    permanentTokenLiquidity,
    permanentlyLockedTokens: graduationTokenReserve - permanentTokenLiquidity,
    permanentLiquidityTvl: graduationThreshold * 2,
  };
}
