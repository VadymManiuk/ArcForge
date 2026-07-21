export const factoryAbi = [
  {
    type: "function",
    name: "launchToken",
    stateMutability: "nonpayable",
    inputs: [{
      name: "params",
      type: "tuple",
      components: [
        { name: "name", type: "string" }, { name: "symbol", type: "string" },
        { name: "metadataURI", type: "string" }, { name: "totalSupply", type: "uint256" },
        { name: "creatorAllocationBps", type: "uint16" }, { name: "virtualUsdcReserve", type: "uint256" },
        { name: "graduationThreshold", type: "uint256" },
      ],
    }],
    outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }],
  },
] as const;

export const bondingCurveAbi = [
  { type: "function", name: "quoteBuy", stateMutability: "view", inputs: [{ name: "usdcAmount", type: "uint256" }], outputs: [{ name: "tokensOut", type: "uint256" }, { name: "fee", type: "uint256" }] },
  { type: "function", name: "quoteSell", stateMutability: "view", inputs: [{ name: "tokenAmount", type: "uint256" }], outputs: [{ name: "usdcOut", type: "uint256" }, { name: "fee", type: "uint256" }] },
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "usdcAmount", type: "uint256" }, { name: "minTokensOut", type: "uint256" }], outputs: [{ name: "tokensOut", type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "tokenAmount", type: "uint256" }, { name: "minUsdcOut", type: "uint256" }], outputs: [{ name: "usdcOut", type: "uint256" }] },
] as const;
